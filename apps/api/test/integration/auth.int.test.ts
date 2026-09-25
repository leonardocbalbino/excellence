import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  authenticatedResponseSchema,
  authUserSchema,
  loginResponseSchema,
  mfaActivateResponseSchema,
  mfaPendingResponseSchema,
  mfaSetupResponseSchema,
  problemDetailsSchema,
  ProblemType,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { generateTotpCode } from '../../src/modules/auth/domain/totp';
import { createTestPrisma, createTestUser, TEST_PASSWORD } from './support/db';
import { createTestApp } from './support/test-app';

const REFRESH_COOKIE = 'excellence_rt';

describe('Autenticação (integração)', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrisma();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => {
    if (!app) throw new Error('App não inicializada');
    return request(app.getHttpServer());
  };
  const problemOf = (body: unknown) => problemDetailsSchema.parse(body);

  function refreshCookieOf(res: request.Response): string | undefined {
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const cookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    return cookie?.split(';')[0]?.slice(REFRESH_COOKIE.length + 1);
  }

  function login(email: string, client: 'web' | 'mobile' = 'web', password = TEST_PASSWORD) {
    return http().post('/api/v1/auth/login').send({ email, password, client });
  }

  describe('login', () => {
    it('web: devolve access token e o refresh token só em cookie httpOnly', async () => {
      const user = await createTestUser(prisma);
      const res = await login(user.email).expect(200);

      const body = authenticatedResponseSchema.parse(res.body);
      expect(body.refreshToken).toBeUndefined();
      expect(body.user).toMatchObject({
        id: user.id,
        companyId: user.companyId,
        mfaEnabled: false,
      });
      expect(res.headers['cache-control']).toBe('no-store');

      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Strict/);
      expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(setCookie).toMatch(/Secure/);
    });

    it('mobile: devolve o refresh token no corpo, sem cookie', async () => {
      const user = await createTestUser(prisma);
      const res = await login(user.email, 'mobile').expect(200);
      expect(authenticatedResponseSchema.parse(res.body).refreshToken).toBeTruthy();
      expect(refreshCookieOf(res)).toBeUndefined();
    });

    it('aceita e-mail com caixa e espaços diferentes', async () => {
      const user = await createTestUser(prisma);
      await login(`  ${user.email.toUpperCase()} `).expect(200);
    });

    it('responde igual para senha errada, e-mail inexistente e usuário inativo', async () => {
      const user = await createTestUser(prisma);
      const inactive = await createTestUser(prisma, { isActive: false });
      const responses = await Promise.all([
        login(user.email, 'web', 'senha-errada'),
        login('ninguem@teste.com.br'),
        login(inactive.email),
      ]);
      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(problemOf(res.body)).toMatchObject({
          type: ProblemType.InvalidCredentials,
          detail: 'E-mail ou senha inválidos.',
        });
      }
    });

    it('bloqueia após LOGIN_MAX_ATTEMPTS falhas com 429 e Retry-After', async () => {
      const user = await createTestUser(prisma);
      for (let i = 0; i < 5; i++) await login(user.email, 'web', 'errada').expect(401);
      // Mesmo com a senha certa, fica bloqueado durante a janela.
      const res = await login(user.email).expect(429);
      expect(problemOf(res.body).type).toBe(ProblemType.TooManyAttempts);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('valida o corpo com o schema compartilhado', async () => {
      const res = await http().post('/api/v1/auth/login').send({ email: 'x' }).expect(400);
      expect(problemOf(res.body).errors?.map((e) => e.path)).toEqual(['email', 'password']);
    });
  });

  describe('rotas protegidas', () => {
    it('exigem Bearer token válido', async () => {
      const missing = await http().get('/api/v1/auth/me').expect(401);
      expect(problemOf(missing.body).type).toBe(ProblemType.Unauthenticated);
      expect(missing.headers['www-authenticate']).toBe('Bearer');
      await http().get('/api/v1/auth/me').set('Authorization', 'Bearer lixo').expect(401);
    });

    it('/auth/me devolve o usuário da sessão', async () => {
      const user = await createTestUser(prisma);
      const { accessToken } = authenticatedResponseSchema.parse((await login(user.email)).body);
      const res = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(authUserSchema.parse(res.body)).toMatchObject({ id: user.id, email: user.email });
    });
  });

  describe('refresh rotativo', () => {
    it('web: troca o cookie por uma sessão nova e rotaciona o token', async () => {
      const user = await createTestUser(prisma);
      const first = refreshCookieOf(await login(user.email));
      const res = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${first}`)
        .expect(200);
      authenticatedResponseSchema.parse(res.body);
      const second = refreshCookieOf(res);
      expect(second).toBeTruthy();
      expect(second).not.toBe(first);
    });

    it('reuso de token consumido revoga a família inteira', async () => {
      const user = await createTestUser(prisma);
      const first = authenticatedResponseSchema.parse(
        (await login(user.email, 'mobile')).body,
      ).refreshToken;
      const rotated = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first, client: 'mobile' })
        .expect(200);
      const second = authenticatedResponseSchema.parse(rotated.body).refreshToken;

      // Um atacante reapresenta o primeiro token: a sessão toda cai.
      const reuse = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first, client: 'mobile' })
        .expect(401);
      expect(problemOf(reuse.body).type).toBe(ProblemType.InvalidRefreshToken);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: second, client: 'mobile' })
        .expect(401);

      const tokens = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(tokens.every((t) => t.revokedReason === 'reuse_detected')).toBe(true);
    });

    it('refresh concorrente com o mesmo token: só um vence', async () => {
      const user = await createTestUser(prisma);
      const token = authenticatedResponseSchema.parse(
        (await login(user.email, 'mobile')).body,
      ).refreshToken;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          http().post('/api/v1/auth/refresh').send({ refreshToken: token, client: 'mobile' }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    });

    it('usuário desativado perde a sessão no próximo refresh', async () => {
      const user = await createTestUser(prisma);
      const token = authenticatedResponseSchema.parse(
        (await login(user.email, 'mobile')).body,
      ).refreshToken;
      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: token, client: 'mobile' })
        .expect(401);
    });

    it('sem token responde 401', async () => {
      await http().post('/api/v1/auth/refresh').expect(401);
    });
  });

  describe('logout', () => {
    it('revoga a sessão e limpa o cookie', async () => {
      const user = await createTestUser(prisma);
      const cookie = refreshCookieOf(await login(user.email));
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', `${REFRESH_COOKIE}=${cookie}`)
        .expect(204);
      expect(String(res.headers['set-cookie'])).toMatch(/excellence_rt=;/);
      await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', `${REFRESH_COOKIE}=${cookie}`)
        .expect(401);
    });

    it('é idempotente sem token', async () => {
      await http().post('/api/v1/auth/logout').expect(204);
    });
  });

  describe('MFA (TOTP)', () => {
    it('ativação voluntária, login com desafio, replay e código de recuperação', async () => {
      const user = await createTestUser(prisma);
      const { accessToken } = authenticatedResponseSchema.parse((await login(user.email)).body);
      const auth = { Authorization: `Bearer ${accessToken}` };

      const setup = mfaSetupResponseSchema.parse(
        (await http().post('/api/v1/auth/mfa/setup').set(auth).expect(200)).body,
      );
      expect(setup.otpauthUrl).toContain(encodeURIComponent(user.email));

      // Código errado não ativa.
      await http().post('/api/v1/auth/mfa/activate').set(auth).send({ code: '000000' }).expect(401);

      const activationCode = generateTotpCode(setup.secret, Date.now());
      const activated = mfaActivateResponseSchema.parse(
        (
          await http()
            .post('/api/v1/auth/mfa/activate')
            .set(auth)
            .send({ code: activationCode })
            .expect(200)
        ).body,
      );
      expect(activated.recoveryCodes).toHaveLength(10);
      expect(activated.session).toBeUndefined();

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.mfaEnabled).toBe(true);
      expect(stored.mfaSecret).not.toContain(setup.secret);

      // Agora o login exige o segundo fator.
      const challenge = mfaPendingResponseSchema.parse((await login(user.email)).body);
      expect(challenge.status).toBe('mfa_required');
      const mfaAuth = { Authorization: `Bearer ${challenge.mfaToken}` };

      // O token de desafio não abre rotas comuns.
      await http().get('/api/v1/auth/me').set(mfaAuth).expect(401);

      // Replay: o código usado na ativação não vale de novo.
      await http()
        .post('/api/v1/auth/mfa/verify')
        .set(mfaAuth)
        .send({ code: activationCode })
        .expect(401);

      // Código do próximo passo é aceito.
      const next = generateTotpCode(setup.secret, Date.now() + 30_000);
      const session = await http()
        .post('/api/v1/auth/mfa/verify')
        .set(mfaAuth)
        .send({ code: next })
        .expect(200);
      expect(authenticatedResponseSchema.parse(session.body).user.mfaEnabled).toBe(true);
      expect(refreshCookieOf(session)).toBeTruthy();

      // Código de recuperação vale uma única vez.
      const recovery = activated.recoveryCodes[0] ?? '';
      const second = mfaPendingResponseSchema.parse((await login(user.email)).body);
      const secondAuth = { Authorization: `Bearer ${second.mfaToken}` };
      await http()
        .post('/api/v1/auth/mfa/verify')
        .set(secondAuth)
        .send({ code: recovery.toLowerCase() })
        .expect(200);
      const third = mfaPendingResponseSchema.parse((await login(user.email)).body);
      await http()
        .post('/api/v1/auth/mfa/verify')
        .set({ Authorization: `Bearer ${third.mfaToken}` })
        .send({ code: recovery })
        .expect(401);

      // Não dá para configurar de novo com MFA ativo.
      const { accessToken: fresh } = authenticatedResponseSchema.parse(session.body);
      const again = await http()
        .post('/api/v1/auth/mfa/setup')
        .set({ Authorization: `Bearer ${fresh}` })
        .expect(409);
      expect(problemOf(again.body).type).toBe(ProblemType.MfaAlreadyEnabled);
    });

    it('limita tentativas de código por desafio', async () => {
      const user = await createTestUser(prisma);
      const { accessToken } = authenticatedResponseSchema.parse((await login(user.email)).body);
      const auth = { Authorization: `Bearer ${accessToken}` };
      const { secret } = mfaSetupResponseSchema.parse(
        (await http().post('/api/v1/auth/mfa/setup').set(auth)).body,
      );
      await http()
        .post('/api/v1/auth/mfa/activate')
        .set(auth)
        .send({ code: generateTotpCode(secret, Date.now()) })
        .expect(200);

      const { mfaToken } = mfaPendingResponseSchema.parse((await login(user.email)).body);
      const mfaAuth = { Authorization: `Bearer ${mfaToken}` };
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/api/v1/auth/mfa/verify')
          .set(mfaAuth)
          .send({ code: '000000' })
          .expect(401);
      }
      const blocked = await http()
        .post('/api/v1/auth/mfa/verify')
        .set(mfaAuth)
        .send({ code: generateTotpCode(secret, Date.now() + 30_000) })
        .expect(429);
      expect(problemOf(blocked.body).type).toBe(ProblemType.TooManyAttempts);
    });
  });

  it('o schema de resposta do login cobre todos os casos', () => {
    expect(() =>
      loginResponseSchema.parse({ status: 'mfa_required', mfaToken: 't', expiresIn: 300 }),
    ).not.toThrow();
  });
});
