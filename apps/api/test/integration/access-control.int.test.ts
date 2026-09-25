import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  mfaPendingResponseSchema,
  myAccessSchema,
  PERMISSION_KEYS,
  problemDetailsSchema,
  ProblemType,
  roleSchema,
  userWithRolesSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { AccessResolver } from '../../src/modules/access-control/application/access-resolver.service';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser, TEST_PASSWORD } from './support/db';
import { createUnit } from './support/organization';
import { createTestApp } from './support/test-app';

describe('RBAC (integração)', () => {
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

  /** Empresa nova com um administrador (todas as permissões, sem MFA para simplificar). */
  async function companyWithAdmin() {
    const admin = await createTestUser(prisma);
    const adminRole = await createRole(prisma, admin.companyId, {
      permissions: [...PERMISSION_KEYS],
    });
    await grantRole(prisma, admin, adminRole);
    const { id: unitId } = await createUnit(prisma, admin.companyId);
    return { admin, adminRole, unitId, auth: await authHeader(http, admin.email) };
  }

  const roleInput = (overrides: Record<string, unknown> = {}) => ({
    name: `Perfil ${Math.random().toString(36).slice(2)}`,
    permissions: ['roles:read'],
    scopes: [{ type: 'company' }],
    ...overrides,
  });

  it('sincroniza o catálogo de permissões no banco ao iniciar', async () => {
    const stored = await prisma.permission.findMany({ select: { key: true } });
    expect(stored.map((p) => p.key).sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  describe('negação por padrão', () => {
    it('usuário sem perfil não acessa rotas com permissão, mas vê o próprio acesso', async () => {
      const user = await createTestUser(prisma);
      const auth = await authHeader(http, user.email);
      const res = await http().get('/api/v1/roles').set(auth).expect(403);
      expect(problemOf(res.body).type).toBe(ProblemType.Forbidden);

      const me = myAccessSchema.parse(
        (await http().get('/api/v1/me/access').set(auth).expect(200)).body,
      );
      expect(me).toEqual({
        permissions: [],
        mfaSetupRequired: false,
        passwordChangeRequired: false,
      });
    });
  });

  describe('gestão de perfis', () => {
    it('ciclo completo: listar, criar, editar e excluir', async () => {
      const { auth, unitId } = await companyWithAdmin();

      const catalog = await http().get('/api/v1/permissions').set(auth).expect(200);
      expect((catalog.body as unknown[]).length).toBe(PERMISSION_KEYS.length);

      const created = roleSchema.parse(
        (
          await http()
            .post('/api/v1/roles')
            .set(auth)
            .send(roleInput({ scopes: [{ type: 'unit', unitId }, { type: 'self' }] }))
            .expect(201)
        ).body,
      );
      expect(created).toMatchObject({ isSystem: false, userCount: 0, permissions: ['roles:read'] });
      expect(created.scopes).toEqual([{ type: 'unit', unitId }, { type: 'self' }]);

      const updated = roleSchema.parse(
        (
          await http()
            .put(`/api/v1/roles/${created.id}`)
            .set(auth)
            .send(
              roleInput({
                name: 'Supervisor noturno',
                requiresMfa: true,
                permissions: ['users:read', 'roles:read'],
              }),
            )
            .expect(200)
        ).body,
      );
      expect(updated).toMatchObject({
        name: 'Supervisor noturno',
        requiresMfa: true,
        permissions: ['roles:read', 'users:read'],
        scopes: [{ type: 'company' }],
      });

      const list = z
        .array(roleSchema)
        .parse((await http().get('/api/v1/roles').set(auth).expect(200)).body);
      expect(list.map((r) => r.id)).toContain(created.id);

      await http().delete(`/api/v1/roles/${created.id}`).set(auth).expect(204);
      await http().get(`/api/v1/roles/${created.id}`).set(auth).expect(404);
    });

    it('valida o corpo: escopo de unidade sem unitId e permissão inexistente', async () => {
      const { auth } = await companyWithAdmin();
      const res = await http()
        .post('/api/v1/roles')
        .set(auth)
        .send(roleInput({ permissions: ['nao:existe'], scopes: [{ type: 'unit' }] }))
        .expect(400);
      expect(problemOf(res.body).errors?.map((e) => e.path)).toEqual([
        'permissions.0',
        'scopes.0.unitId',
      ]);
    });

    it('nome de perfil é único por empresa, sem diferenciar maiúsculas', async () => {
      const { auth } = await companyWithAdmin();
      await http()
        .post('/api/v1/roles')
        .set(auth)
        .send(roleInput({ name: 'Portaria' }))
        .expect(201);
      const res = await http()
        .post('/api/v1/roles')
        .set(auth)
        .send(roleInput({ name: 'PORTARIA' }))
        .expect(409);
      expect(problemOf(res.body).type).toBe(ProblemType.UniqueViolation);
    });

    it('perfil padrão não pode ser excluído; perfil em uso também não', async () => {
      const { admin, auth } = await companyWithAdmin();
      const system = await createRole(prisma, admin.companyId, { permissions: [], isSystem: true });
      const system409 = await http().delete(`/api/v1/roles/${system.id}`).set(auth).expect(409);
      expect(problemOf(system409.body).type).toBe(ProblemType.SystemRole);

      const inUse = await createRole(prisma, admin.companyId, { permissions: [] });
      await grantRole(prisma, await createTestUser(prisma, { companyId: admin.companyId }), inUse);
      const inUse409 = await http().delete(`/api/v1/roles/${inUse.id}`).set(auth).expect(409);
      expect(problemOf(inUse409.body).type).toBe(ProblemType.RoleInUse);
    });
  });

  describe('isolamento entre empresas', () => {
    it('não enxerga nem altera perfis e usuários de outra empresa', async () => {
      const a = await companyWithAdmin();
      const b = await companyWithAdmin();

      await http().get(`/api/v1/roles/${a.adminRole.id}`).set(b.auth).expect(404);
      await http().put(`/api/v1/roles/${a.adminRole.id}`).set(b.auth).send(roleInput()).expect(404);
      await http().delete(`/api/v1/roles/${a.adminRole.id}`).set(b.auth).expect(404);

      const usersB = z
        .array(userWithRolesSchema)
        .parse((await http().get('/api/v1/users').set(b.auth).expect(200)).body);
      expect(usersB.map((u) => u.id)).not.toContain(a.admin.id);

      // Atribuir perfil de A a usuário de B, ou mexer em usuário de A.
      const res = await http()
        .put(`/api/v1/users/${b.admin.id}/roles`)
        .set(b.auth)
        .send({ roleIds: [b.adminRole.id, a.adminRole.id] })
        .expect(422);
      expect(problemOf(res.body).status).toBe(422);
      await http()
        .put(`/api/v1/users/${a.admin.id}/roles`)
        .set(b.auth)
        .send({ roleIds: [] })
        .expect(404);
    });
  });

  describe('regras de segurança', () => {
    it('impede conceder permissões que quem edita não tem', async () => {
      const { admin } = await companyWithAdmin();
      const limited = await createTestUser(prisma, { companyId: admin.companyId });
      await grantRole(
        prisma,
        limited,
        await createRole(prisma, admin.companyId, { permissions: ['roles:read', 'roles:manage'] }),
      );
      const auth = await authHeader(http, limited.email);

      const res = await http()
        .post('/api/v1/roles')
        .set(auth)
        .send(roleInput({ permissions: ['roles:read', 'users:manage'] }))
        .expect(403);
      expect(problemOf(res.body)).toMatchObject({ type: ProblemType.PrivilegeEscalation });
      expect(problemOf(res.body).detail).toContain('users:manage');

      await http()
        .post('/api/v1/roles')
        .set(auth)
        .send(roleInput({ permissions: ['roles:read'] }))
        .expect(201);
    });

    it('gestão de perfis exige a permissão com escopo de empresa', async () => {
      const { admin, unitId } = await companyWithAdmin();
      const unitManager = await createTestUser(prisma, { companyId: admin.companyId });
      await grantRole(
        prisma,
        unitManager,
        await createRole(prisma, admin.companyId, {
          permissions: ['roles:read', 'roles:manage'],
          scopes: [{ type: 'unit', unitId }],
        }),
      );
      const auth = await authHeader(http, unitManager.email);
      await http().get('/api/v1/roles').set(auth).expect(200);
      await http().post('/api/v1/roles').set(auth).send(roleInput()).expect(403);
    });

    it('não permite deixar a empresa sem administrador', async () => {
      const { admin, adminRole, auth } = await companyWithAdmin();

      const selfRemoval = await http()
        .put(`/api/v1/users/${admin.id}/roles`)
        .set(auth)
        .send({ roleIds: [] })
        .expect(409);
      expect(problemOf(selfRemoval.body).type).toBe(ProblemType.LastAdministrator);

      const downgrade = await http()
        .put(`/api/v1/roles/${adminRole.id}`)
        .set(auth)
        .send(roleInput({ permissions: ['roles:read'] }))
        .expect(409);
      expect(problemOf(downgrade.body).type).toBe(ProblemType.LastAdministrator);

      // Com um segundo administrador, a remoção passa.
      const second = await createTestUser(prisma, { companyId: admin.companyId });
      await grantRole(prisma, second, adminRole);
      const res = await http()
        .put(`/api/v1/users/${admin.id}/roles`)
        .set(auth)
        .send({ roleIds: [] })
        .expect(200);
      expect(userWithRolesSchema.parse(res.body).roles).toEqual([]);
    });

    it('perfil que passa a exigir MFA bloqueia o acesso até o MFA ser ativado', async () => {
      const { admin } = await companyWithAdmin();
      const user = await createTestUser(prisma, { companyId: admin.companyId });
      const role = await createRole(prisma, admin.companyId, { permissions: ['roles:read'] });
      await grantRole(prisma, user, role);
      const auth = await authHeader(http, user.email);
      await http().get('/api/v1/roles').set(auth).expect(200);

      await prisma.role.update({ where: { id: role.id }, data: { requiresMfa: true } });

      const blocked = await http().get('/api/v1/roles').set(auth).expect(403);
      expect(problemOf(blocked.body).type).toBe(ProblemType.MfaSetupRequired);
      const me = myAccessSchema.parse(
        (await http().get('/api/v1/me/access').set(auth).expect(200)).body,
      );
      expect(me.mfaSetupRequired).toBe(true);
      await http().post('/api/v1/auth/mfa/setup').set(auth).expect(200);

      // No próximo login, a política baseada no perfil exige o cadastro do MFA.
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD });
      expect(mfaPendingResponseSchema.parse(login.body).status).toBe('mfa_enrollment_required');
    });
  });

  describe('escopo efetivo', () => {
    it('o escopo de uma permissão é a união só dos perfis que a concedem', async () => {
      const { admin, unitId } = await companyWithAdmin();
      const user = await createTestUser(prisma, { companyId: admin.companyId });
      await grantRole(
        prisma,
        user,
        await createRole(prisma, admin.companyId, {
          permissions: ['users:read'],
          scopes: [{ type: 'unit', unitId }],
        }),
      );
      await grantRole(
        prisma,
        user,
        await createRole(prisma, admin.companyId, {
          permissions: ['roles:read', 'users:read'],
          scopes: [{ type: 'self' }],
        }),
      );
      await grantRole(
        prisma,
        user,
        await createRole(prisma, admin.companyId, { permissions: ['roles:read'] }),
      );

      const access = await app?.get(AccessResolver).resolve(user.id, user.companyId);
      expect(access?.permissions.get('users:read')).toEqual({
        companyWide: false,
        unitIds: [unitId],
        departmentIds: [],
        ownTeam: false,
        self: true,
      });
      expect(access?.permissions.get('roles:read')?.companyWide).toBe(true);
      expect(access?.permissions.has('users:manage')).toBe(false);
    });

    it('não resolve usuário de outra empresa', async () => {
      const a = await companyWithAdmin();
      const b = await companyWithAdmin();
      await expect(
        app?.get(AccessResolver).resolve(a.admin.id, b.admin.companyId),
      ).resolves.toBeNull();
    });
  });
});
