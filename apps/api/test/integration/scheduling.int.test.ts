import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  holidaySchema,
  PERMISSION_KEYS,
  plannedDaySchema,
  problemDetailsSchema,
  ProblemType,
  scheduleAssignmentSchema,
  shiftSchema,
  workScheduleSchema,
} from '@excellence/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createEmployee, createUnit } from './support/organization';
import { createTestApp } from './support/test-app';

describe('Jornada (integração)', () => {
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

  async function scenario() {
    const admin = await createTestUser(prisma);
    const companyId = admin.companyId;
    await grantRole(
      prisma,
      admin,
      await createRole(prisma, companyId, { permissions: [...PERMISSION_KEYS] }),
    );
    const unit = await prisma.unit.update({
      where: { id: (await createUnit(prisma, companyId)).id },
      data: { state: 'SP', city: 'São Paulo' },
    });
    return { companyId, admin, unit, auth: await authHeader(http, admin.email) };
  }

  async function createShift(auth: { Authorization: string }, body: Record<string, unknown>) {
    const res = await http()
      .post('/api/v1/shifts')
      .set(auth)
      .send({ breakMinutes: 60, code: null, ...body })
      .expect(201);
    return shiftSchema.parse(res.body);
  }

  async function createSchedule(auth: { Authorization: string }, body: Record<string, unknown>) {
    const res = await http()
      .post('/api/v1/work-schedules')
      .set(auth)
      .send({ code: null, notes: null, weeklyMinutes: null, cycleAnchor: null, days: [], ...body })
      .expect(201);
    return workScheduleSchema.parse(res.body);
  }

  describe('turnos e escalas', () => {
    it('turno noturno atravessa a meia-noite; intervalo não pode passar da duração', async () => {
      const { auth } = await scenario();
      const night = await createShift(auth, { name: 'Noturno', start: '19:00', end: '07:00' });
      expect(night).toMatchObject({ crossesMidnight: true, workMinutes: 660 });

      const bad = await http()
        .post('/api/v1/shifts')
        .set(auth)
        .send({ name: 'Ruim', code: null, start: '08:00', end: '09:00', breakMinutes: 60 })
        .expect(400);
      expect(problemOf(bad.body).errors?.[0]?.path).toBe('breakMinutes');
      await http()
        .post('/api/v1/shifts')
        .set(auth)
        .send({ name: 'NOTURNO', code: null, start: '20:00', end: '08:00', breakMinutes: 0 })
        .expect(409);
    });

    it('valida o ciclo e protege turno em uso', async () => {
      const { auth } = await scenario();
      const shift = await createShift(auth, { name: 'Comercial', start: '08:00', end: '17:00' });

      const partialWeek = await http()
        .post('/api/v1/work-schedules')
        .set(auth)
        .send({
          name: '6 dias',
          code: null,
          kind: 'cycle',
          cycleAnchor: 'monday',
          days: Array(6).fill(shift.id),
          weeklyMinutes: null,
          notes: null,
        })
        .expect(400);
      expect(problemOf(partialWeek.body).detail).toBeDefined();

      const flexibleWithoutHours = await http()
        .post('/api/v1/work-schedules')
        .set(auth)
        .send({
          name: 'Flex',
          code: null,
          kind: 'flexible',
          cycleAnchor: null,
          days: [],
          weeklyMinutes: null,
          notes: null,
        })
        .expect(400);
      expect(problemOf(flexibleWithoutHours.body).errors?.[0]?.path).toBe('weeklyMinutes');

      const schedule = await createSchedule(auth, {
        name: '5x2',
        kind: 'cycle',
        cycleAnchor: 'monday',
        days: [shift.id, shift.id, shift.id, shift.id, shift.id, null, null],
      });
      expect(schedule.days).toHaveLength(7);

      const inUse = await http().delete(`/api/v1/shifts/${shift.id}`).set(auth).expect(409);
      expect(problemOf(inUse.body).type).toBe(ProblemType.InUse);
    });

    it('não aceita turno de outra empresa no ciclo', async () => {
      const a = await scenario();
      const b = await scenario();
      const shiftB = await createShift(b.auth, { name: 'De B', start: '08:00', end: '17:00' });
      const res = await http()
        .post('/api/v1/work-schedules')
        .set(a.auth)
        .send({
          name: 'X',
          code: null,
          kind: 'cycle',
          cycleAnchor: 'assignment',
          days: [shiftB.id, null],
          weeklyMinutes: null,
          notes: null,
        })
        .expect(422);
      expect(problemOf(res.body).errors?.[0]?.path).toBe('days');
    });
  });

  describe('feriados', () => {
    it('abrangência coerente, lista por ano e sugestões nacionais', async () => {
      const { auth, unit } = await scenario();
      const missingState = await http()
        .post('/api/v1/holidays')
        .set(auth)
        .send({
          date: '2026-07-09',
          name: 'Revolução Constitucionalista',
          scope: 'state',
          state: null,
          city: null,
          unitId: null,
        })
        .expect(400);
      expect(problemOf(missingState.body).errors?.[0]?.path).toBe('state');

      await http()
        .post('/api/v1/holidays')
        .set(auth)
        .send({
          date: '2026-07-09',
          name: 'Revolução Constitucionalista',
          scope: 'state',
          state: 'SP',
          city: 'ignorado',
          unitId: unit.id,
        })
        .expect(201);
      const list = z
        .array(holidaySchema)
        .parse((await http().get('/api/v1/holidays?year=2026').set(auth).expect(200)).body);
      // Campos fora da abrangência são descartados.
      expect(list).toEqual([
        expect.objectContaining({ scope: 'state', state: 'SP', city: null, unitId: null }),
      ]);
      expect((await http().get('/api/v1/holidays?year=2027').set(auth)).body).toEqual([]);

      const suggestions = await http()
        .get('/api/v1/holidays/national-suggestions?year=2026')
        .set(auth)
        .expect(200);
      expect(suggestions.body).toContainEqual({
        date: '2026-12-25',
        name: 'Natal',
        legalBasis: 'Lei 662/1949',
      });
    });
  });

  describe('vínculo e escala prevista', () => {
    async function setup() {
      const s = await scenario();
      const shift = await createShift(s.auth, { name: 'Comercial', start: '08:00', end: '17:00' });
      const twelve = await createShift(s.auth, { name: '12h', start: '07:00', end: '19:00' });
      const fiveTwo = await createSchedule(s.auth, {
        name: '5x2',
        kind: 'cycle',
        cycleAnchor: 'monday',
        days: [shift.id, shift.id, shift.id, shift.id, shift.id, null, null],
      });
      const twelveThirtySix = await createSchedule(s.auth, {
        name: '12x36',
        kind: 'cycle',
        cycleAnchor: 'assignment',
        days: [twelve.id, null],
      });
      const employee = await createEmployee(prisma, s.companyId, { unitId: s.unit.id });
      return { ...s, fiveTwo, twelveThirtySix, employee };
    }

    it('troca de escala encerra a anterior; vínculo futuro pode ser removido e reabre a anterior', async () => {
      const { auth, fiveTwo, twelveThirtySix, employee } = await setup();
      const base = `/api/v1/employees/${employee.id}/schedule-assignments`;

      await http()
        .post(base)
        .set(auth)
        .send({ scheduleId: fiveTwo.id, startDate: '2024-02-01' })
        .expect(201);
      const future = scheduleAssignmentSchema.parse(
        (
          await http()
            .post(base)
            .set(auth)
            .send({ scheduleId: twelveThirtySix.id, startDate: '2099-01-10' })
            .expect(201)
        ).body,
      );
      let list = z
        .array(scheduleAssignmentSchema)
        .parse((await http().get(base).set(auth).expect(200)).body);
      expect(list.map((a) => [a.scheduleName, a.startDate, a.endDate])).toEqual([
        ['12x36', '2099-01-10', null],
        ['5x2', '2024-02-01', '2099-01-09'],
      ]);

      // Não dá para criar vínculo antes de um que já existe.
      const overlap = await http()
        .post(base)
        .set(auth)
        .send({ scheduleId: fiveTwo.id, startDate: '2099-01-01' })
        .expect(409);
      expect(problemOf(overlap.body).type).toBe(ProblemType.AssignmentOverlap);

      await http().delete(`${base}/${future.id}`).set(auth).expect(204);
      list = z.array(scheduleAssignmentSchema).parse((await http().get(base).set(auth)).body);
      expect(list.map((a) => [a.scheduleName, a.endDate])).toEqual([['5x2', null]]);

      // Vínculo em vigor é histórico.
      const current = list[0];
      const past = await http()
        .delete(`${base}/${current?.id ?? ''}`)
        .set(auth)
        .expect(409);
      expect(problemOf(past.body).type).toBe(ProblemType.AssignmentOverlap);

      // Antes da admissão (2024-01-02), não.
      await http()
        .post(base)
        .set(auth)
        .send({ scheduleId: twelveThirtySix.id, startDate: '2023-12-01' })
        .expect(422);
    });

    it('o banco impede períodos sobrepostos mesmo por fora da API', async () => {
      const { companyId, fiveTwo, employee } = await setup();
      const data = {
        companyId,
        employeeId: employee.id,
        scheduleId: fiveTwo.id,
        startDate: new Date('2025-01-01T00:00:00Z'),
        cycleStartDate: new Date('2025-01-01T00:00:00Z'),
      };
      await prisma.employeeScheduleAssignment.create({ data });
      await expect(
        prisma.employeeScheduleAssignment.create({
          data: { ...data, startDate: new Date('2025-06-01T00:00:00Z') },
        }),
      ).rejects.toThrow();
    });

    it('escala prevista com feriado aplicável e 12x36 ancorada no funcionário', async () => {
      const { auth, companyId, unit, fiveTwo, twelveThirtySix, employee } = await setup();
      await http()
        .post(`/api/v1/employees/${employee.id}/schedule-assignments`)
        .set(auth)
        .send({ scheduleId: fiveTwo.id, startDate: '2026-09-01' })
        .expect(201);
      await http()
        .post('/api/v1/holidays')
        .set(auth)
        .send({
          date: '2026-11-20',
          name: 'Consciência Negra',
          scope: 'national',
          state: null,
          city: null,
          unitId: null,
        })
        .expect(201);
      await http()
        .post('/api/v1/holidays')
        .set(auth)
        .send({
          date: '2026-11-19',
          name: 'Só no RJ',
          scope: 'state',
          state: 'RJ',
          city: null,
          unitId: null,
        })
        .expect(201);

      const days = z
        .array(plannedDaySchema)
        .parse(
          (
            await http()
              .get(
                `/api/v1/employees/${employee.id}/planned-schedule?from=2026-11-19&to=2026-11-22`,
              )
              .set(auth)
              .expect(200)
          ).body,
        );
      expect(days.map((d) => [d.date, d.shift?.start ?? 'folga', d.holiday?.name ?? null])).toEqual(
        [
          ['2026-11-19', '08:00', null],
          ['2026-11-20', '08:00', 'Consciência Negra'],
          ['2026-11-21', 'folga', null],
          ['2026-11-22', 'folga', null],
        ],
      );

      const other = await createEmployee(prisma, companyId, { unitId: unit.id });
      await http()
        .post(`/api/v1/employees/${other.id}/schedule-assignments`)
        .set(auth)
        .send({
          scheduleId: twelveThirtySix.id,
          startDate: '2026-09-01',
          cycleStartDate: '2026-09-02',
        })
        .expect(201);
      const alternating = z
        .array(plannedDaySchema)
        .parse(
          (
            await http()
              .get(`/api/v1/employees/${other.id}/planned-schedule?from=2026-09-01&to=2026-09-04`)
              .set(auth)
          ).body,
        );
      expect(alternating.map((d) => d.shift?.name ?? '-')).toEqual(['-', '12h', '-', '12h']);

      const tooLong = await http()
        .get(`/api/v1/employees/${other.id}/planned-schedule?from=2026-01-01&to=2026-12-31`)
        .set(auth)
        .expect(400);
      expect(problemOf(tooLong.body).errors?.[0]?.path).toBe('to');
    });

    it('gestor vê a escala da equipe; funcionário vê a própria; fora do escopo, não', async () => {
      const { auth, companyId, unit, fiveTwo } = await setup();
      const managerUser = await createTestUser(prisma, { companyId });
      await grantRole(
        prisma,
        managerUser,
        await createRole(prisma, companyId, {
          permissions: ['employees:read'],
          scopes: [{ type: 'own_team' }],
        }),
      );
      const managerRecord = await createEmployee(prisma, companyId, {
        unitId: unit.id,
        userId: managerUser.id,
      });
      const reportUser = await createTestUser(prisma, { companyId });
      const report = await createEmployee(prisma, companyId, {
        unitId: unit.id,
        managerId: managerRecord.id,
        userId: reportUser.id,
      });
      const stranger = await createEmployee(prisma, companyId, { unitId: unit.id });
      for (const id of [report.id, stranger.id]) {
        await http()
          .post(`/api/v1/employees/${id}/schedule-assignments`)
          .set(auth)
          .send({ scheduleId: fiveTwo.id, startDate: '2026-01-05' })
          .expect(201);
      }

      const managerAuth = await authHeader(http, managerUser.email);
      await http()
        .get(`/api/v1/employees/${report.id}/planned-schedule?from=2026-09-21&to=2026-09-27`)
        .set(managerAuth)
        .expect(200);
      await http()
        .get(`/api/v1/employees/${stranger.id}/planned-schedule?from=2026-09-21&to=2026-09-27`)
        .set(managerAuth)
        .expect(404);
      // Gestor sem schedules:assign não vincula.
      await http()
        .post(`/api/v1/employees/${report.id}/schedule-assignments`)
        .set(managerAuth)
        .send({ scheduleId: fiveTwo.id, startDate: '2027-01-04' })
        .expect(403);

      const reportAuth = await authHeader(http, reportUser.email);
      const mine = z
        .array(plannedDaySchema)
        .parse(
          (
            await http()
              .get('/api/v1/me/planned-schedule?from=2026-09-21&to=2026-09-27')
              .set(reportAuth)
              .expect(200)
          ).body,
        );
      expect(mine.filter((d) => d.shift).length).toBe(5);
    });
  });
});
