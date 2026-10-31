import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  benefitSchema,
  employeeBenefitSchema,
  myBenefitSchema,
  myPayrollPreviewSchema,
  PERMISSION_KEYS,
  payrollPeriodDetailSchema,
  payrollPeriodSchema,
  positionSchema,
  problemDetailsSchema,
  ProblemType,
  usefulLinkSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createEmployee, createUnit } from './support/organization';
import { createTestApp } from './support/test-app';

describe('Benefícios, links e fechamento (integração)', () => {
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

  /** RH com todas as permissões, um cargo e um funcionário com conta. */
  async function scenario() {
    const admin = await createTestUser(prisma);
    const companyId = admin.companyId;
    await grantRole(
      prisma,
      admin,
      await createRole(prisma, companyId, { permissions: [...PERMISSION_KEYS] }),
    );
    const auth = await authHeader(http, admin.email);
    const unit = await createUnit(prisma, companyId);
    const position = positionSchema.parse(
      (
        await http()
          .post('/api/v1/positions')
          .set(auth)
          .send({ name: 'Vigilante', baseSalary: 2350.5 })
          .expect(201)
      ).body,
    );
    const employeeUser = await createTestUser(prisma, { companyId });
    const employee = await createEmployee(prisma, companyId, {
      unitId: unit.id,
      userId: employeeUser.id,
      name: 'Vera Vigia',
    });
    await prisma.employee.update({ where: { id: employee.id }, data: { positionId: position.id } });
    return {
      companyId,
      auth,
      position,
      employee,
      employeeAuth: await authHeader(http, employeeUser.email),
    };
  }

  it('salário do cargo só aparece e muda com payroll:manage', async () => {
    const { companyId, position } = await scenario();
    expect(position.baseSalary).toBe(2350.5);

    const clerk = await createTestUser(prisma, { companyId });
    await grantRole(
      prisma,
      clerk,
      await createRole(prisma, companyId, {
        permissions: ['positions:read', 'positions:manage'],
      }),
    );
    const clerkAuth = await authHeader(http, clerk.email);
    const seen = positionSchema.parse(
      (await http().get(`/api/v1/positions/${position.id}`).set(clerkAuth).expect(200)).body,
    );
    expect(seen.baseSalary).toBeNull();

    // Sem payroll:manage, o salário enviado é ignorado (o atual fica).
    await http()
      .put(`/api/v1/positions/${position.id}`)
      .set(clerkAuth)
      .send({ name: 'Vigilante', baseSalary: 1 })
      .expect(200);
    const stored = await prisma.position.findUniqueOrThrow({ where: { id: position.id } });
    expect(stored.baseSalaryCents).toBe(235050);
  });

  it('benefícios: catálogo, atribuição sem sobreposição e visão do funcionário', async () => {
    const { auth, employee, employeeAuth } = await scenario();
    const vt = benefitSchema.parse(
      (
        await http()
          .post('/api/v1/benefits')
          .set(auth)
          .send({
            name: 'Vale-transporte',
            kind: 'transport',
            howToUse: 'Cartão entregue pelo RH.',
            defaultCompanyValue: 220,
          })
          .expect(201)
      ).body,
    );
    const assigned = employeeBenefitSchema.parse(
      (
        await http()
          .post(`/api/v1/employees/${employee.id}/benefits`)
          .set(auth)
          .send({
            benefitId: vt.id,
            companyValue: 220,
            employeeDiscount: 141.03,
            startDate: '2024-02-01',
          })
          .expect(201)
      ).body,
    );
    expect(assigned).toMatchObject({ active: true, employeeDiscount: 141.03 });

    const clash = await http()
      .post(`/api/v1/employees/${employee.id}/benefits`)
      .set(auth)
      .send({ benefitId: vt.id, companyValue: 100, startDate: '2025-01-01' })
      .expect(409);
    expect(problemOf(clash.body).type).toBe(ProblemType.BenefitOverlap);

    const mine = z
      .array(myBenefitSchema)
      .parse((await http().get('/api/v1/me/benefits').set(employeeAuth).expect(200)).body);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.benefit).toMatchObject({
      name: 'Vale-transporte',
      howToUse: 'Cartão entregue pelo RH.',
    });

    // Benefício em uso não é excluído; o funcionário não gerencia.
    await http().delete(`/api/v1/benefits/${vt.id}`).set(auth).expect(409);
    await http().get('/api/v1/benefits').set(employeeAuth).expect(403);
  });

  it('links úteis: só os ativos, em ordem, para qualquer usuário', async () => {
    const { auth, employeeAuth } = await scenario();
    for (const [name, position, isActive] of [
      ['Meu INSS', 2, true],
      ['FGTS', 1, true],
      ['Antigo', 0, false],
    ] as const) {
      await http()
        .post('/api/v1/useful-links')
        .set(auth)
        .send({ name, url: 'https://www.gov.br/', position, isActive })
        .expect(201);
    }
    await http()
      .post('/api/v1/useful-links')
      .set(auth)
      .send({ name: 'Perigoso', url: 'javascript:alert(1)' })
      .expect(400);
    const links = z
      .array(usefulLinkSchema)
      .parse((await http().get('/api/v1/me/useful-links').set(employeeAuth).expect(200)).body);
    expect(links.map((l) => l.name)).toEqual(['FGTS', 'Meu INSS']);
  });

  it('fechamento: gera, publica a prévia, fecha, exporta e o banco congela o mês', async () => {
    const { auth, employee, employeeAuth } = await scenario();
    const month = '2026-08';
    const generated = payrollPeriodDetailSchema.parse(
      (await http().post('/api/v1/payroll-periods').set(auth).send({ month }).expect(201)).body,
    );
    expect(generated).toMatchObject({ status: 'draft', cutoffDate: '2026-08-31' });
    const item = generated.items.find((i) => i.employee.id === employee.id);
    expect(item).toMatchObject({ baseSalary: 2350.5, position: 'Vigilante' });

    // Gerar de novo (ainda aberto) substitui os itens.
    const regenerated = payrollPeriodDetailSchema.parse(
      (await http().post('/api/v1/payroll-periods').set(auth).send({ month }).expect(201)).body,
    );
    expect(regenerated.id).toBe(generated.id);
    expect(regenerated.items).toHaveLength(generated.items.length);

    // Rascunho: o funcionário ainda não vê.
    const before = z
      .array(myPayrollPreviewSchema)
      .parse((await http().get('/api/v1/me/payroll-previews').set(employeeAuth).expect(200)).body);
    expect(before).toEqual([]);

    await http().post(`/api/v1/payroll-periods/${generated.id}/publish`).set(auth).expect(201);
    const after = z
      .array(myPayrollPreviewSchema)
      .parse((await http().get('/api/v1/me/payroll-previews').set(employeeAuth).expect(200)).body);
    expect(after.map((p) => p.month)).toEqual([month]);
    expect(after[0]?.item.employee.id).toBe(employee.id);

    const closedPeriod = payrollPeriodSchema.parse(
      (await http().post(`/api/v1/payroll-periods/${generated.id}/close`).set(auth).expect(201))
        .body,
    );
    expect(closedPeriod.status).toBe('closed');
    const again = await http()
      .post('/api/v1/payroll-periods')
      .set(auth)
      .send({ month })
      .expect(409);
    expect(problemOf(again.body).type).toBe(ProblemType.PayrollClosed);

    const csv = await http()
      .get(`/api/v1/payroll-periods/${generated.id}/export`)
      .set(auth)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Competência 2026-08');
    expect(csv.text).toContain('Vera Vigia');
    expect(csv.text).toContain('2350,50');

    // Por fora da API também não muda.
    await expect(
      prisma.payrollItem.updateMany({ where: { periodId: generated.id }, data: { data: {} } }),
    ).rejects.toThrow();
    await expect(
      prisma.payrollItem.deleteMany({ where: { periodId: generated.id } }),
    ).rejects.toThrow();
    await expect(
      prisma.payrollPeriod.update({ where: { id: generated.id }, data: { status: 'draft' } }),
    ).rejects.toThrow();

    // Mês que ainda não começou.
    await http().post('/api/v1/payroll-periods').set(auth).send({ month: '2099-01' }).expect(400);
  });
});
