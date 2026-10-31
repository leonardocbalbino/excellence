import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  myAccessSchema,
  myPatrolsSchema,
  PERMISSION_KEYS,
  patrolBoardSchema,
  patrolPointSchema,
  patrolRouteSchema,
  patrolRunSchema,
  problemDetailsSchema,
  ProblemType,
} from '@excellence/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { authHeader, createRole, grantRole } from './support/access';
import { createTestPrisma, createTestUser } from './support/db';
import { createEmployee, createUnit } from './support/organization';
import { createTestApp } from './support/test-app';

type Auth = Record<'Authorization', string>;

describe('Rondas (integração)', () => {
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
  const key = () => ({ 'Idempotency-Key': randomUUID() });

  /** Empresa com gestão total, uma unidade, 3 pontos e um vigilante com conta. */
  async function scenario(options: { enforceOrder?: boolean } = {}) {
    const admin = await createTestUser(prisma);
    const companyId = admin.companyId;
    await grantRole(
      prisma,
      admin,
      await createRole(prisma, companyId, { permissions: [...PERMISSION_KEYS] }),
    );
    const auth = await authHeader(http, admin.email);
    const unit = await createUnit(prisma, companyId);
    const guardUser = await createTestUser(prisma, { companyId });
    const guard = await createEmployee(prisma, companyId, {
      unitId: unit.id,
      userId: guardUser.id,
      name: 'Vigilante',
    });

    const points = [];
    for (const name of ['Portão', 'Pátio', 'Galpão']) {
      const res = await http()
        .post('/api/v1/patrol-points')
        .set(auth)
        .send({ unitId: unit.id, name })
        .expect(201);
      points.push(patrolPointSchema.parse(res.body));
    }
    const route = patrolRouteSchema.parse(
      (
        await http()
          .post('/api/v1/patrol-routes')
          .set(auth)
          .send({
            unitId: unit.id,
            name: 'Perímetro',
            expectedMinutes: 30,
            enforceOrder: options.enforceOrder ?? false,
            pointIds: points.map((p) => p.id),
            assigneeIds: [guard.id],
          })
          .expect(201)
      ).body,
    );
    return {
      companyId,
      auth,
      unit,
      guard,
      guardAuth: await authHeader(http, guardUser.email),
      points,
      route,
    };
  }

  async function start(auth: Auth, routeId: string) {
    const res = await http()
      .post('/api/v1/me/patrol-runs')
      .set(auth)
      .set(key())
      .send({ routeId })
      .expect(201);
    return patrolRunSchema.parse(res.body);
  }

  function checkin(auth: Auth, runId: string, code: string) {
    return http()
      .post(`/api/v1/me/patrol-runs/${runId}/checkins`)
      .set(auth)
      .set(key())
      .send({ code, latitude: null, longitude: null });
  }

  it('cadastro: ponto com QR, rota só com pontos da própria unidade', async () => {
    const { auth, companyId, route, points } = await scenario();
    expect(route.points.map((p) => p.name)).toEqual(['Portão', 'Pátio', 'Galpão']);
    expect(points[0]?.code).toMatch(/^EXR1\.[0-9a-f-]{36}\.[\w-]{22}$/);

    const other = await createUnit(prisma, companyId);
    const res = await http()
      .post('/api/v1/patrol-routes')
      .set(auth)
      .send({
        unitId: other.id,
        name: 'Outra',
        expectedMinutes: 20,
        pointIds: [points[0]?.id],
      })
      .expect(422);
    expect(problemOf(res.body).errors?.[0]?.path).toBe('pointIds');

    // Horários exigem os dias da semana.
    await http()
      .put(`/api/v1/patrol-routes/${route.id}`)
      .set(auth)
      .send({
        unitId: route.unit.id,
        name: route.name,
        expectedMinutes: 30,
        pointIds: points.map((p) => p.id),
        startTimes: ['19:00'],
      })
      .expect(400);
  });

  it('ronda: fora de ordem é sinalizado, QR adulterado recusado e o último ponto encerra', async () => {
    const { guardAuth, route, points } = await scenario();
    const [portao, patio, galpao] = points;
    if (!portao || !patio || !galpao) throw new Error('pontos');

    const mine = myPatrolsSchema.parse(
      (await http().get('/api/v1/me/patrols').set(guardAuth).expect(200)).body,
    );
    expect(mine.routes.map((r) => r.id)).toEqual([route.id]);
    expect(mine.current).toBeNull();
    const access = myAccessSchema.parse(
      (await http().get('/api/v1/me/access').set(guardAuth).expect(200)).body,
    );
    expect(access.hasPatrolRoutes).toBe(true);

    const run = await start(guardAuth, route.id);
    expect(run).toMatchObject({ status: 'in_progress', checked: 0, total: 3 });
    expect(run.nextPoint?.name).toBe('Portão');

    // Uma ronda aberta por vez.
    const again = await http()
      .post('/api/v1/me/patrol-runs')
      .set(guardAuth)
      .set(key())
      .send({ routeId: route.id })
      .expect(409);
    expect(problemOf(again.body).type).toBe(ProblemType.PatrolRunOpen);

    const tampered = await checkin(guardAuth, run.id, `${patio.code.slice(0, -2)}xx`).expect(422);
    expect(problemOf(tampered.body).type).toBe(ProblemType.PatrolInvalidCode);
    const junk = await checkin(guardAuth, run.id, 'https://exemplo.com').expect(422);
    expect(problemOf(junk.body).type).toBe(ProblemType.PatrolInvalidCode);

    const afterPatio = patrolRunSchema.parse(
      (await checkin(guardAuth, run.id, patio.code).expect(201)).body,
    );
    expect(afterPatio.points[1]?.checkin?.outOfOrder).toBe(true);
    expect(afterPatio.nextPoint?.name).toBe('Portão');

    const repeated = await checkin(guardAuth, run.id, patio.code).expect(409);
    expect(problemOf(repeated.body).type).toBe(ProblemType.PatrolPointAlreadyChecked);

    await checkin(guardAuth, run.id, portao.code).expect(201);
    const done = patrolRunSchema.parse(
      (await checkin(guardAuth, run.id, galpao.code).expect(201)).body,
    );
    expect(done).toMatchObject({ status: 'completed', checked: 3, nextPoint: null });
    expect(done.finishedAt).not.toBeNull();

    const closed = await checkin(guardAuth, run.id, galpao.code).expect(409);
    expect(problemOf(closed.body).type).toBe(ProblemType.PatrolRunFinished);
  });

  it('rota com ordem obrigatória recusa ponto fora de ordem', async () => {
    const { guardAuth, route, points } = await scenario({ enforceOrder: true });
    const run = await start(guardAuth, route.id);
    const res = await checkin(guardAuth, run.id, points[1]?.code ?? '').expect(422);
    expect(problemOf(res.body).type).toBe(ProblemType.PatrolOutOfOrder);
    await checkin(guardAuth, run.id, points[0]?.code ?? '').expect(201);
  });

  it('encerrar faltando pontos exige motivo; novo QR invalida o impresso antes', async () => {
    const { auth, guardAuth, route, points } = await scenario();
    const run = await start(guardAuth, route.id);
    const noNote = await http()
      .post(`/api/v1/me/patrol-runs/${run.id}/finish`)
      .set(guardAuth)
      .send({})
      .expect(422);
    expect(problemOf(noNote.body).errors?.[0]?.path).toBe('note');
    const finished = patrolRunSchema.parse(
      (
        await http()
          .post(`/api/v1/me/patrol-runs/${run.id}/finish`)
          .set(guardAuth)
          .send({ note: 'Chuva forte, galpão alagado.' })
          .expect(201)
      ).body,
    );
    expect(finished).toMatchObject({
      status: 'incomplete',
      finishNote: 'Chuva forte, galpão alagado.',
    });

    const old = points[0]?.code ?? '';
    await http().post(`/api/v1/patrol-points/${points[0]?.id}/code`).set(auth).expect(201);
    const next = await start(guardAuth, route.id);
    const res = await checkin(guardAuth, next.id, old).expect(422);
    expect(problemOf(res.body).type).toBe(ProblemType.PatrolInvalidCode);
  });

  it('só quem está na rota faz a ronda; ronda de outro responde como inexistente', async () => {
    const { companyId, unit, guardAuth, route } = await scenario();
    const outsiderUser = await createTestUser(prisma, { companyId });
    await createEmployee(prisma, companyId, { unitId: unit.id, userId: outsiderUser.id });
    const outsiderAuth = await authHeader(http, outsiderUser.email);
    const res = await http()
      .post('/api/v1/me/patrol-runs')
      .set(outsiderAuth)
      .set(key())
      .send({ routeId: route.id })
      .expect(403);
    expect(problemOf(res.body).type).toBe(ProblemType.PatrolNotAssigned);

    const run = await start(guardAuth, route.id);
    await http()
      .post(`/api/v1/me/patrol-runs/${run.id}/finish`)
      .set(outsiderAuth)
      .send({ note: 'x' })
      .expect(404);
  });

  it('gestor acompanha as rondas da equipe, não as de fora nem as próprias', async () => {
    const { companyId, unit, auth, guard, guardAuth, route } = await scenario();
    const managerUser = await createTestUser(prisma, { companyId });
    await grantRole(
      prisma,
      managerUser,
      await createRole(prisma, companyId, {
        permissions: ['patrols:read'],
        scopes: [{ type: 'own_team' }],
      }),
    );
    const manager = await createEmployee(prisma, companyId, {
      unitId: unit.id,
      userId: managerUser.id,
    });
    await prisma.employee.update({ where: { id: guard.id }, data: { managerId: manager.id } });

    // Outro vigilante, fora da equipe, na mesma rota.
    const strangerUser = await createTestUser(prisma, { companyId });
    const stranger = await createEmployee(prisma, companyId, {
      unitId: unit.id,
      userId: strangerUser.id,
    });
    const current = patrolRouteSchema.parse(
      (await http().get(`/api/v1/patrol-routes/${route.id}`).set(auth).expect(200)).body,
    );
    await http()
      .put(`/api/v1/patrol-routes/${route.id}`)
      .set(auth)
      .send({
        unitId: current.unit.id,
        name: current.name,
        expectedMinutes: current.expectedMinutes,
        pointIds: current.points.map((p) => p.id),
        assigneeIds: [guard.id, stranger.id],
      })
      .expect(200);

    const teamRun = await start(guardAuth, route.id);
    const strangerRun = await start(await authHeader(http, strangerUser.email), route.id);

    const managerAuth = await authHeader(http, managerUser.email);
    // Data de hoje no fuso padrão da empresa (a unidade de teste não define fuso).
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    );
    const board = patrolBoardSchema.parse(
      (await http().get(`/api/v1/patrol-runs/board?date=${today}`).set(managerAuth).expect(200))
        .body,
    );
    expect(board.runs.map((r) => r.id)).toEqual([teamRun.id]);

    await http().get(`/api/v1/patrol-runs/${teamRun.id}`).set(managerAuth).expect(200);
    await http().get(`/api/v1/patrol-runs/${strangerRun.id}`).set(managerAuth).expect(404);
  });

  it('o banco impede alterar check-ins e reabrir ronda encerrada', async () => {
    const { guardAuth, route, points } = await scenario();
    const run = await start(guardAuth, route.id);
    await checkin(guardAuth, run.id, points[0]?.code ?? '').expect(201);

    const saved = await prisma.patrolCheckin.findFirstOrThrow({ where: { runId: run.id } });
    await expect(
      prisma.patrolCheckin.update({ where: { id: saved.id }, data: { outOfOrder: true } }),
    ).rejects.toThrow();
    await expect(prisma.patrolCheckin.delete({ where: { id: saved.id } })).rejects.toThrow();

    // Mudar outra coisa além do encerramento é recusado.
    await expect(
      prisma.patrolRun.update({ where: { id: run.id }, data: { enforceOrder: true } }),
    ).rejects.toThrow();
    await prisma.patrolRun.update({
      where: { id: run.id },
      data: { status: 'incomplete', finishedAt: new Date(), finishNote: 'teste' },
    });
    await expect(
      prisma.patrolRun.update({
        where: { id: run.id },
        data: { status: 'in_progress', finishedAt: null },
      }),
    ).rejects.toThrow();
    await expect(prisma.patrolRun.delete({ where: { id: run.id } })).rejects.toThrow();
  });
});
