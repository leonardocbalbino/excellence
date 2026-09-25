import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  auditLogPageSchema,
  PERMISSION_KEYS,
  problemDetailsSchema,
  ProblemType,
  roleSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createTestApp } from './support/test-app';

describe('Auditoria (integração)', () => {
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

  async function companyWithAdmin() {
    const admin = await createTestUser(prisma);
    const adminRole = await createRole(prisma, admin.companyId, {
      permissions: [...PERMISSION_KEYS],
    });
    await grantRole(prisma, admin, adminRole);
    return { admin, adminRole, auth: await authHeader(http, admin.email) };
  }

  const logsOf = (companyId: string, action?: string) =>
    prisma.auditLog.findMany({
      where: { companyId, ...(action ? { action } : {}) },
      orderBy: { occurredAt: 'asc' },
    });

  describe('append-only', () => {
    it('o banco recusa UPDATE, DELETE e TRUNCATE em audit_logs', async () => {
      const { admin } = await companyWithAdmin();
      const [log] = await logsOf(admin.companyId, 'auth.login_succeeded');
      expect(log).toBeDefined();

      await expect(
        prisma.$executeRaw`UPDATE audit_logs SET action = 'adulterado' WHERE id = ${log?.id}::uuid`,
      ).rejects.toThrow(/append-only/);
      await expect(
        prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${log?.id}::uuid`,
      ).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRaw`TRUNCATE audit_logs`).rejects.toThrow(/append-only/);
      expect((await prisma.auditLog.findUnique({ where: { id: log?.id ?? '' } }))?.action).toBe(
        'auth.login_succeeded',
      );
    });
  });

  describe('eventos registrados', () => {
    it('login com sucesso e com falha', async () => {
      const user = await createTestUser(prisma);
      await http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'errada' })
        .expect(401);
      await authHeader(http, user.email);

      const logs = await logsOf(user.companyId);
      expect(logs.map((l) => l.action)).toEqual(['auth.login_failed', 'auth.login_succeeded']);
      expect(logs[0]).toMatchObject({
        actorUserId: user.id,
        resourceType: 'user',
        resourceId: user.id,
        metadata: expect.objectContaining({ reason: 'wrong_password' }) as unknown,
      });
      expect(logs[1]?.actorIp).toBeTruthy();
      expect(logs[1]?.requestId).toBeTruthy();
    });

    it('criação e edição de perfil guardam antes e depois; mudança desfeita não deixa rastro', async () => {
      const { admin, adminRole, auth } = await companyWithAdmin();
      const created = roleSchema.parse(
        (
          await http()
            .post('/api/v1/roles')
            .set(auth)
            .send({ name: 'Portaria', permissions: ['roles:read'], scopes: [{ type: 'self' }] })
            .expect(201)
        ).body,
      );
      await http()
        .put(`/api/v1/roles/${created.id}`)
        .set(auth)
        .send({ name: 'Portaria', permissions: [], scopes: [{ type: 'self' }] })
        .expect(200);
      // Rebaixar o único administrador é desfeito, e a auditoria junto.
      await http()
        .put(`/api/v1/roles/${adminRole.id}`)
        .set(auth)
        .send({ name: 'Admin', permissions: [], scopes: [{ type: 'company' }] })
        .expect(409);

      const [createdLog] = await logsOf(admin.companyId, 'role.created');
      expect(createdLog).toMatchObject({ actorUserId: admin.id, resourceId: created.id });
      const updates = await logsOf(admin.companyId, 'role.updated');
      expect(updates).toHaveLength(1);
      expect(updates[0]?.metadata).toMatchObject({
        before: { permissions: ['roles:read'] },
        after: { permissions: [] },
      });
    });

    it('atribuição de perfis registra o que entrou e o que saiu', async () => {
      const { admin, auth } = await companyWithAdmin();
      const user = await createTestUser(prisma, { companyId: admin.companyId });
      const role = await createRole(prisma, admin.companyId, { permissions: ['roles:read'] });
      await http()
        .put(`/api/v1/users/${user.id}/roles`)
        .set(auth)
        .send({ roleIds: [role.id] })
        .expect(200);
      const [log] = await logsOf(admin.companyId, 'user.roles_changed');
      expect(log).toMatchObject({
        resourceId: user.id,
        metadata: { added: [role.id], removed: [] },
      });
    });
  });

  describe('consulta da trilha', () => {
    it('exige audit:read e a própria consulta é auditada (dado sensível)', async () => {
      const { admin, auth } = await companyWithAdmin();
      const noAccess = await createTestUser(prisma, { companyId: admin.companyId });
      const noAccessAuth = await authHeader(http, noAccess.email);
      const denied = await http().get('/api/v1/audit-logs').set(noAccessAuth).expect(403);
      expect(problemDetailsSchema.parse(denied.body).type).toBe(ProblemType.Forbidden);

      await http().get('/api/v1/audit-logs?action=auth.login_succeeded').set(auth).expect(200);
      const [readLog] = await logsOf(admin.companyId, 'sensitive_data.read');
      expect(readLog).toMatchObject({
        actorUserId: admin.id,
        resourceId: 'GET /api/v1/audit-logs',
        metadata: expect.objectContaining({
          permission: 'audit:read',
          query: { action: 'auth.login_succeeded' },
        }) as unknown,
      });
    });

    it('filtra, pagina por cursor e não mostra outra empresa', async () => {
      const a = await companyWithAdmin();
      const b = await companyWithAdmin();
      // Mais dois logins do admin de A.
      await authHeader(http, a.admin.email);
      await authHeader(http, a.admin.email);

      const first = auditLogPageSchema.parse(
        (
          await http()
            .get('/api/v1/audit-logs?action=auth.login_succeeded&limit=2')
            .set(a.auth)
            .expect(200)
        ).body,
      );
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toBeTruthy();
      const second = auditLogPageSchema.parse(
        (
          await http()
            .get(
              `/api/v1/audit-logs?action=auth.login_succeeded&limit=2&cursor=${first.nextCursor ?? ''}`,
            )
            .set(a.auth)
            .expect(200)
        ).body,
      );
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map((i) => i.id);
      expect(new Set(ids).size).toBe(3);
      // Mais recente primeiro.
      const times = [...first.items, ...second.items].map((i) => i.occurredAt);
      expect([...times].sort().reverse()).toEqual(times);

      const fromB = auditLogPageSchema.parse(
        (await http().get('/api/v1/audit-logs').set(b.auth).expect(200)).body,
      );
      expect(fromB.items.every((i) => i.actorUserId !== a.admin.id)).toBe(true);
    });

    it('cursor inválido responde 400', async () => {
      const { auth } = await companyWithAdmin();
      await http().get('/api/v1/audit-logs?cursor=lixo').set(auth).expect(400);
    });
  });
});
