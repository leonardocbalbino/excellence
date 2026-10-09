import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  companySchema,
  departmentSchema,
  PERMISSION_KEYS,
  type Permission,
  problemDetailsSchema,
  ProblemType,
  unitSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createEmployee, createUnit } from './support/organization';
import { createTestApp } from './support/test-app';

const unitInput = (overrides: Record<string, unknown> = {}) => ({
  name: 'Posto Centro',
  code: `P${Math.random().toString(36).slice(2, 8)}`,
  cnpj: null,
  street: 'Rua Direita',
  number: '10',
  complement: null,
  district: 'Centro',
  city: 'São Luís',
  state: 'MA',
  postalCode: '01002-000',
  latitude: -2.5496,
  longitude: -44.2394,
  geofenceRadiusMeters: 100,
  timezone: null,
  ...overrides,
});

describe('Organização (integração)', () => {
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

  async function userWith(
    permissions: Permission[],
    companyId?: string,
    scopes?: Parameters<typeof createRole>[2]['scopes'],
  ) {
    const user = await createTestUser(prisma, companyId ? { companyId } : {});
    await grantRole(
      prisma,
      user,
      await createRole(prisma, user.companyId, { permissions, ...(scopes ? { scopes } : {}) }),
    );
    return { user, auth: await authHeader(http, user.email) };
  }

  describe('empresa', () => {
    it('qualquer usuário lê; só company:manage altera; aceita CNPJ alfanumérico', async () => {
      const admin = await userWith([...PERMISSION_KEYS]);
      const reader = await userWith([], admin.user.companyId);

      const current = companySchema.parse(
        (await http().get('/api/v1/company').set(reader.auth).expect(200)).body,
      );
      await http()
        .put('/api/v1/company')
        .set(reader.auth)
        .send({ ...current, name: 'Outro nome' })
        .expect(403);

      const updated = companySchema.parse(
        (
          await http()
            .put('/api/v1/company')
            .set(admin.auth)
            .send({
              name: 'Segurança Exemplo',
              legalName: 'Segurança Exemplo Ltda.',
              cnpj: `12.ABC.345/01DE-35`,
              timezone: 'America/Manaus',
              defaultEmployeeRoleId: null,
            })
            .expect(200)
        ).body,
      );
      expect(updated).toMatchObject({ cnpj: '12ABC34501DE35', timezone: 'America/Manaus' });

      const invalid = await http()
        .put('/api/v1/company')
        .set(admin.auth)
        .send({ ...updated, cnpj: '11.222.333/0001-80', timezone: 'Marte/Olympus' })
        .expect(400);
      expect(problemOf(invalid.body).errors?.map((e) => e.path)).toEqual(['cnpj', 'timezone']);

      // CNPJ já usado por outra empresa.
      const other = await userWith([...PERMISSION_KEYS]);
      const dup = await http()
        .put('/api/v1/company')
        .set(other.auth)
        .send({ ...updated, name: 'Outra' })
        .expect(409);
      expect(problemOf(dup.body).errors?.[0]?.path).toBe('cnpj');
    });

    it('perfil padrão de contas novas: só com as permissões dele', async () => {
      const admin = await userWith([...PERMISSION_KEYS]);
      const powerful = await createRole(prisma, admin.user.companyId, {
        permissions: ['audit:read'],
      });
      const limited = await userWith(['company:manage'], admin.user.companyId);
      const body = {
        name: 'Nome novo',
        legalName: null,
        cnpj: null,
        timezone: 'America/Sao_Paulo',
        defaultEmployeeRoleId: powerful.id,
      };
      const res = await http().put('/api/v1/company').set(limited.auth).send(body).expect(403);
      expect(problemOf(res.body).type).toBe(ProblemType.PrivilegeEscalation);
      await http().put('/api/v1/company').set(admin.auth).send(body).expect(200);
    });
  });

  describe('unidades', () => {
    it('ciclo completo com geofence, código único e exclusão protegida', async () => {
      const { auth, user } = await userWith([...PERMISSION_KEYS]);

      const created = unitSchema.parse(
        (
          await http()
            .post('/api/v1/units')
            .set(auth)
            .send(unitInput({ code: 'centro' }))
            .expect(201)
        ).body,
      );
      expect(created).toMatchObject({
        code: 'centro',
        postalCode: '01002000',
        geofenceRadiusMeters: 100,
      });

      // Código repetido (sem diferenciar maiúsculas).
      const dup = await http()
        .post('/api/v1/units')
        .set(auth)
        .send(unitInput({ code: 'CENTRO' }))
        .expect(409);
      expect(problemOf(dup.body).errors?.[0]?.path).toBe('code');

      // Cerca virtual exige coordenadas.
      const noCoords = await http()
        .post('/api/v1/units')
        .set(auth)
        .send(unitInput({ latitude: null, longitude: null }))
        .expect(400);
      expect(problemOf(noCoords.body).errors?.map((e) => e.path)).toEqual(['geofenceRadiusMeters']);

      const updated = unitSchema.parse(
        (
          await http()
            .put(`/api/v1/units/${created.id}`)
            .set(auth)
            .send(unitInput({ code: 'centro', isActive: false, geofenceRadiusMeters: 300 }))
            .expect(200)
        ).body,
      );
      expect(updated).toMatchObject({ isActive: false, geofenceRadiusMeters: 300 });

      // Inativa não aparece na lista padrão.
      const active = z
        .array(unitSchema)
        .parse((await http().get('/api/v1/units').set(auth).expect(200)).body);
      expect(active.map((u) => u.id)).not.toContain(created.id);
      const all = z
        .array(unitSchema)
        .parse((await http().get('/api/v1/units?includeInactive=true').set(auth).expect(200)).body);
      expect(all.map((u) => u.id)).toContain(created.id);

      // Com funcionário, não exclui.
      const busy = await createUnit(prisma, user.companyId);
      await createEmployee(prisma, user.companyId, { unitId: busy.id });
      const inUse = await http().delete(`/api/v1/units/${busy.id}`).set(auth).expect(409);
      expect(problemOf(inUse.body).type).toBe(ProblemType.InUse);

      await http().delete(`/api/v1/units/${created.id}`).set(auth).expect(204);
      const [log] = await prisma.auditLog.findMany({
        where: { resourceId: created.id, action: 'unit.updated' },
      });
      expect(log?.metadata).toMatchObject({
        before: { geofenceRadiusMeters: 100 },
        after: { geofenceRadiusMeters: 300 },
      });
    });

    it('gestão exige escopo de empresa; leitura não', async () => {
      const admin = await userWith([...PERMISSION_KEYS]);
      const unit = await createUnit(prisma, admin.user.companyId);
      const unitManager = await userWith(['units:read', 'units:manage'], admin.user.companyId, [
        { type: 'unit', unitId: unit.id },
      ]);
      await http().get('/api/v1/units').set(unitManager.auth).expect(200);
      await http().post('/api/v1/units').set(unitManager.auth).send(unitInput()).expect(403);
    });

    it('não enxerga unidade de outra empresa', async () => {
      const a = await userWith([...PERMISSION_KEYS]);
      const b = await userWith([...PERMISSION_KEYS]);
      const unitA = await createUnit(prisma, a.user.companyId);
      await http().get(`/api/v1/units/${unitA.id}`).set(b.auth).expect(404);
      await http().delete(`/api/v1/units/${unitA.id}`).set(b.auth).expect(404);
    });
  });

  describe('departamentos, cargos e sindicatos', () => {
    it('departamento só aceita unidade da própria empresa', async () => {
      const a = await userWith([...PERMISSION_KEYS]);
      const b = await userWith([...PERMISSION_KEYS]);
      const unitB = await createUnit(prisma, b.user.companyId);
      const res = await http()
        .post('/api/v1/departments')
        .set(a.auth)
        .send({ name: 'Portaria', code: null, unitId: unitB.id })
        .expect(422);
      expect(problemOf(res.body).errors?.[0]?.path).toBe('unitId');

      const unitA = await createUnit(prisma, a.user.companyId);
      const dep = departmentSchema.parse(
        (
          await http()
            .post('/api/v1/departments')
            .set(a.auth)
            .send({ name: 'Portaria', code: 'port', unitId: unitA.id })
            .expect(201)
        ).body,
      );
      expect(dep.unitId).toBe(unitA.id);
    });

    it('cargo valida CBO e nome único; sindicato valida CNPJ e data-base', async () => {
      const { auth } = await userWith([...PERMISSION_KEYS]);
      await http()
        .post('/api/v1/positions')
        .set(auth)
        .send({ name: 'Vigilante', cbo: '5173-30' })
        .expect(201);
      await http()
        .post('/api/v1/positions')
        .set(auth)
        .send({ name: 'VIGILANTE', cbo: null })
        .expect(409);
      const badCbo = await http()
        .post('/api/v1/positions')
        .set(auth)
        .send({ name: 'Porteiro', cbo: '12' })
        .expect(400);
      expect(problemOf(badCbo.body).errors?.[0]?.path).toBe('cbo');

      const union = await http()
        .post('/api/v1/unions')
        .set(auth)
        .send({ name: 'Sindicato X', cnpj: '11.222.333/0001-81', baseMonth: 13 })
        .expect(400);
      expect(problemOf(union.body).errors?.[0]?.path).toBe('baseMonth');
    });
  });
});
