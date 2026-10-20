import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  employeeSchema,
  PERMISSION_KEYS,
  problemDetailsSchema,
  scheduleRateSchema,
  shiftSchema,
  unitMonthlySummarySchema,
  workScheduleSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createDepartment, createEmployee, createUnit } from './support/organization';
import { createTestApp } from './support/test-app';

/** Pasta do posto (ADR 0020): escalas próprias, valor por plantão e resumo do mês. */
describe('Pasta do posto (integração)', () => {
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

  async function scenario() {
    const admin = await createTestUser(prisma);
    const companyId = admin.companyId;
    await grantRole(
      prisma,
      admin,
      await createRole(prisma, companyId, { permissions: [...PERMISSION_KEYS] }),
    );
    const maple = await createUnit(prisma, companyId, { name: 'Maple Bear' });
    const other = await createUnit(prisma, companyId, { name: 'Outro condomínio' });
    return { companyId, maple, other, auth: await authHeader(http, admin.email) };
  }

  async function shift(auth: { Authorization: string }, body: Record<string, unknown>) {
    const res = await http()
      .post('/api/v1/shifts')
      .set(auth)
      .send({ code: null, start: '07:00', end: '19:00', breakMinutes: 60, ...body })
      .expect(201);
    return shiftSchema.parse(res.body);
  }

  async function schedule(auth: { Authorization: string }, body: Record<string, unknown>) {
    const res = await http()
      .post('/api/v1/work-schedules')
      .set(auth)
      .send({
        code: null,
        notes: null,
        weeklyMinutes: null,
        kind: 'cycle',
        cycleAnchor: 'assignment',
        ...body,
      });
    return res;
  }

  it('turnos e escalas do posto: nome único por posto e só usáveis no próprio posto', async () => {
    const { companyId, maple, other, auth } = await scenario();
    const day = await shift(auth, { name: '12h diurno', unitId: maple.id });
    expect(day.unit).toEqual({ id: maple.id, name: 'Maple Bear' });
    // O mesmo nome em outro posto é outro turno.
    const otherDay = await shift(auth, { name: '12h diurno', unitId: other.id });
    await http()
      .post('/api/v1/shifts')
      .set(auth)
      .send({
        name: '12H DIURNO',
        code: null,
        start: '07:00',
        end: '19:00',
        breakMinutes: 0,
        unitId: maple.id,
      })
      .expect(409);

    // Escala do Maple Bear não usa turno do outro posto; escala geral não usa turno de posto.
    expect(
      (await schedule(auth, { name: 'X', unitId: maple.id, days: [otherDay.id, null] })).status,
    ).toBe(400);
    expect((await schedule(auth, { name: 'Y', unitId: null, days: [day.id, null] })).status).toBe(
      400,
    );
    const created = await schedule(auth, {
      name: '12x36 diurno',
      unitId: maple.id,
      days: [day.id, null],
    });
    expect(created.status).toBe(201);
    const scale = workScheduleSchema.parse(created.body);

    // A lista do posto traz as dele e as gerais, não as de outro posto.
    const listed = await http()
      .get(`/api/v1/work-schedules?unitId=${other.id}`)
      .set(auth)
      .expect(200);
    expect(
      z
        .array(workScheduleSchema)
        .parse(listed.body)
        .map((s) => s.id),
    ).not.toContain(scale.id);

    // Funcionário de outro posto não entra na escala do Maple Bear.
    const outsider = await createEmployee(prisma, companyId, { unitId: other.id });
    await http()
      .post(`/api/v1/employees/${outsider.id}/schedule-assignments`)
      .set(auth)
      .send({ scheduleId: scale.id, startDate: '2026-10-01' })
      .expect(400);
    const insider = await createEmployee(prisma, companyId, { unitId: maple.id });
    await http()
      .post(`/api/v1/employees/${insider.id}/schedule-assignments`)
      .set(auth)
      .send({ scheduleId: scale.id, startDate: '2026-10-01' })
      .expect(201);
  });

  it('traz funcionário já cadastrado para o posto; escala do posto antigo impede', async () => {
    const { companyId, maple, other, auth } = await scenario();
    const otherDept = await createDepartment(prisma, companyId, { unitId: other.id });
    const moving = await createEmployee(prisma, companyId, {
      unitId: other.id,
      departmentId: otherDept.id,
    });
    const res = await http()
      .put(`/api/v1/employees/${moving.id}/unit`)
      .set(auth)
      .send({ unitId: maple.id })
      .expect(200);
    const moved = employeeSchema.parse(res.body);
    expect(moved.unit).toEqual({ id: maple.id, name: 'Maple Bear' });
    // O departamento era do posto antigo e sai do cadastro.
    expect(moved.department).toBeNull();

    // Quem está numa escala do Maple Bear precisa trocar de escala antes de sair.
    const day = await shift(auth, { name: '12h diurno', unitId: maple.id });
    const scale = workScheduleSchema.parse(
      (await schedule(auth, { name: '12x36 diurno', unitId: maple.id, days: [day.id, null] })).body,
    );
    await http()
      .post(`/api/v1/employees/${moved.id}/schedule-assignments`)
      .set(auth)
      .send({ scheduleId: scale.id, startDate: '2026-10-01' })
      .expect(201);
    const blocked = await http()
      .put(`/api/v1/employees/${moved.id}/unit`)
      .set(auth)
      .send({ unitId: other.id })
      .expect(422);
    expect(problemDetailsSchema.parse(blocked.body).detail).toContain('12x36 diurno');
  });

  it('valor por plantão com vigência e resumo do mês do posto', async () => {
    const { companyId, maple, auth } = await scenario();
    const day = await shift(auth, { name: '12h diurno', unitId: maple.id });
    const scale = workScheduleSchema.parse(
      (await schedule(auth, { name: '12x36 diurno', unitId: maple.id, days: [day.id, null] })).body,
    );
    const first = await http()
      .put(`/api/v1/units/${maple.id}/schedule-rates`)
      .set(auth)
      .send({ scheduleId: scale.id, validFrom: '2026-01', amount: 150 })
      .expect(200);
    expect(scheduleRateSchema.parse(first.body)).toMatchObject({ amount: 150 });
    // Mesma vigência corrige o valor; nova vigência é o reajuste.
    await http()
      .put(`/api/v1/units/${maple.id}/schedule-rates`)
      .set(auth)
      .send({ scheduleId: scale.id, validFrom: '2026-01', amount: 160 })
      .expect(200);
    await http()
      .put(`/api/v1/units/${maple.id}/schedule-rates`)
      .set(auth)
      .send({ scheduleId: scale.id, validFrom: '2026-11', amount: 180 })
      .expect(200);
    const rates = await http()
      .get(`/api/v1/units/${maple.id}/schedule-rates`)
      .set(auth)
      .expect(200);
    expect(
      z
        .array(scheduleRateSchema)
        .parse(rates.body)
        .map((r) => [r.validFrom, r.amount]),
    ).toEqual([
      ['2026-11', 180],
      ['2026-01', 160],
    ]);

    const employee = await createEmployee(prisma, companyId, { unitId: maple.id, name: 'Fábio' });
    await http()
      .post(`/api/v1/employees/${employee.id}/schedule-assignments`)
      .set(auth)
      .send({ scheduleId: scale.id, startDate: '2026-09-01' })
      .expect(201);
    const res = await http()
      .get(`/api/v1/units/${maple.id}/monthly-summary?month=2026-09`)
      .set(auth)
      .expect(200);
    const summary = unitMonthlySummarySchema.parse(res.body);
    expect(summary.items.map((item) => item.employee.id)).toEqual([employee.id]);
    // Sem marcações: nenhum plantão trabalhado, faltas nos dias de turno.
    expect(summary.totals.shifts).toBe(0);
    expect(summary.totals.absenceDays).toBeGreaterThan(0);
    expect(summary.scheduleChanges).toEqual([
      {
        employee: { id: employee.id, name: 'Fábio' },
        schedule: '12x36 diurno',
        startDate: '2026-09-01',
      },
    ]);
  });

  it('funcionário não envia atestado pelo app: só consulta', async () => {
    const { auth } = await scenario();
    await http().post('/api/v1/me/medical-certificates').set(auth).send({}).expect(404);
    await http().get('/api/v1/me/medical-certificates').set(auth).expect(200);
  });
});
