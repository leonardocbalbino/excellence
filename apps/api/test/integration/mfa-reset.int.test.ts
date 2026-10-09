import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  PERMISSION_KEYS,
  problemDetailsSchema,
  ProblemType,
  userWithRolesSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createTestApp } from './support/test-app';

describe('Redefinição de MFA por RH/Admin (integração)', () => {
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

  /** Usuário com MFA "ativo" direto no banco (o login dele não é usado aqui). */
  async function withMfa(user: { id: string }) {
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true, mfaSecret: 'cifrado', mfaEnabledAt: new Date() },
    });
    await prisma.mfaRecoveryCode.create({
      data: {
        userId: user.id,
        companyId: (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).companyId,
        codeHash: 'x',
      },
    });
  }

  async function scenario() {
    const admin = await createTestUser(prisma);
    const companyId = admin.companyId;
    await grantRole(
      prisma,
      admin,
      await createRole(prisma, companyId, { permissions: [...PERMISSION_KEYS] }),
    );
    const hr = await createTestUser(prisma, { companyId });
    await grantRole(
      prisma,
      hr,
      await createRole(prisma, companyId, {
        permissions: ['users:read', 'users:reset_mfa', 'employees:read'],
      }),
    );
    const worker = await createTestUser(prisma, { companyId });
    return { admin, hr, worker, hrAuth: await authHeader(http, hr.email) };
  }

  it('apaga o MFA, os códigos de recuperação e encerra as sessões do usuário', async () => {
    const { hrAuth, worker } = await scenario();
    // Uma sessão aberta do funcionário.
    await authHeader(http, worker.email);
    await withMfa(worker);

    const res = await http().post(`/api/v1/users/${worker.id}/mfa/reset`).set(hrAuth).expect(201);
    expect(userWithRolesSchema.parse(res.body).mfaEnabled).toBe(false);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: worker.id } });
    expect(stored).toMatchObject({ mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null });
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: worker.id } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: worker.id, revokedAt: null } })).toBe(
      0,
    );
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'user.mfa_reset', resourceId: worker.id },
    });
    expect(audit).not.toBeNull();
  });

  it('recusa o próprio usuário, quem tem mais permissões e quem não tem MFA', async () => {
    const { hrAuth, hr, admin, worker } = await scenario();
    await withMfa(hr);
    await withMfa(admin);

    const own = await http().post(`/api/v1/users/${hr.id}/mfa/reset`).set(hrAuth).expect(403);
    expect(problemOf(own.body).type).toBe(ProblemType.OwnMfaReset);

    // O RH não redefine o MFA do Administrador (tomada de conta).
    const higher = await http().post(`/api/v1/users/${admin.id}/mfa/reset`).set(hrAuth).expect(403);
    expect(problemOf(higher.body).type).toBe(ProblemType.PrivilegeEscalation);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).mfaEnabled).toBe(
      true,
    );

    const none = await http().post(`/api/v1/users/${worker.id}/mfa/reset`).set(hrAuth).expect(409);
    expect(problemOf(none.body).type).toBe(ProblemType.MfaNotEnabled);
  });

  it('sem a permissão, não redefine', async () => {
    const { worker } = await scenario();
    const other = await createTestUser(prisma, { companyId: worker.companyId });
    await withMfa(other);
    const workerAuth = await authHeader(http, worker.email);
    await http().post(`/api/v1/users/${other.id}/mfa/reset`).set(workerAuth).expect(403);
  });
});
