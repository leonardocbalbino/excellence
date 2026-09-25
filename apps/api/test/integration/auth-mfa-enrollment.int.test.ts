import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  authenticatedResponseSchema,
  mfaActivateResponseSchema,
  mfaPendingResponseSchema,
  mfaSetupResponseSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { MFA_POLICY, type MfaPolicy } from '../../src/modules/auth/domain/mfa-policy';
import { generateTotpCode } from '../../src/modules/auth/domain/totp';
import { createTestPrisma, createTestUser, TEST_PASSWORD } from './support/db';
import { createTestApp } from './support/test-app';

/** Política que exige MFA só dos usuários marcados, simulando perfis administrativos. */
const requiredFor = new Set<string>();
const policy: MfaPolicy = { isMfaRequired: (user) => Promise.resolve(requiredFor.has(user.id)) };

describe('MFA obrigatório por política (integração)', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrisma();
    app = await createTestApp({ overrides: [{ token: MFA_POLICY, useValue: policy }] });
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const http = () => {
    if (!app) throw new Error('App não inicializada');
    return request(app.getHttpServer());
  };

  it('usuário sem exigência entra direto', async () => {
    const user = await createTestUser(prisma);
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(authenticatedResponseSchema.parse(res.body).status).toBe('authenticated');
  });

  it('usuário com exigência só obtém sessão depois de cadastrar o MFA', async () => {
    const user = await createTestUser(prisma);
    requiredFor.add(user.id);

    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD, client: 'mobile' })
      .expect(200);
    const pending = mfaPendingResponseSchema.parse(login.body);
    expect(pending.status).toBe('mfa_enrollment_required');
    const auth = { Authorization: `Bearer ${pending.mfaToken}` };

    // O token de cadastro não dá acesso a nada além do cadastro.
    await http().get('/api/v1/auth/me').set(auth).expect(401);
    await http().post('/api/v1/auth/mfa/verify').set(auth).send({ code: '123456' }).expect(401);

    const { secret } = mfaSetupResponseSchema.parse(
      (await http().post('/api/v1/auth/mfa/setup').set(auth).expect(200)).body,
    );
    const activated = mfaActivateResponseSchema.parse(
      (
        await http()
          .post('/api/v1/auth/mfa/activate')
          .set(auth)
          .send({ code: generateTotpCode(secret, Date.now()) })
          .expect(200)
      ).body,
    );

    expect(activated.recoveryCodes).toHaveLength(10);
    // A sessão respeita o cliente do login (mobile: refresh token no corpo).
    expect(activated.session?.refreshToken).toBeTruthy();
    await http()
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${activated.session?.accessToken ?? ''}` })
      .expect(200);
  });
});
