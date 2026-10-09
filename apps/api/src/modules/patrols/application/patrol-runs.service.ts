import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type MyPatrols,
  type PatrolBoard,
  type patrolCheckinInputSchema,
  type PatrolRun,
  type PatrolSlot,
  parsePatrolCode,
  ProblemType,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import { Prisma } from '../../../generated/prisma/client';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { invalidReference } from '../../organization/application/catalog-rules';
import { CompanyService } from '../../organization/application/company.service';
import { addDays } from '../../scheduling/domain/planner';
import { evaluateGeofence } from '../../time-tracking/domain/geofence';
import { OFFLINE_SOURCE, resolveOfflineTime } from '../../time-tracking/domain/offline';
import { toZoned } from '../../time-tracking/domain/zoned-time';
import { EmployeesService } from '../../workforce/application/employees.service';
import { fromCalendarDate, todayIn } from '../../workforce/domain/calendar';
import { employeeScopeWhere } from '../../workforce/domain/employee-scope';
import { tokensMatch } from '../domain/code';
import { lateMinutes, pickSlot, slotsOn, slotStatus } from '../domain/schedule';

type CheckinInput = z.output<typeof patrolCheckinInputSchema>;

export interface PatrolClient {
  ip: string | null;
  userAgent: string | null;
  source: 'web' | 'mobile';
}

const RUN_SELECT = {
  id: true,
  routeId: true,
  pointIds: true,
  enforceOrder: true,
  scheduledFor: true,
  startedAt: true,
  expectedEndAt: true,
  status: true,
  finishedAt: true,
  finishNote: true,
  route: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, timezone: true } },
  employee: { select: { id: true, name: true, socialName: true, userId: true } },
  checkins: {
    select: {
      id: true,
      pointId: true,
      recordedAt: true,
      geofenceStatus: true,
      distanceMeters: true,
      outOfOrder: true,
      source: true,
    },
  },
} as const;

type RunRow = Prisma.PatrolRunGetPayload<{ select: typeof RUN_SELECT }>;

function problem(type: string, status: number, detail: string): ProblemException {
  const titles: Record<number, string> = {
    403: 'Forbidden',
    409: 'Conflict',
    422: 'Unprocessable Entity',
  };
  return new ProblemException({ type, title: titles[status] ?? 'Error', status, detail });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Rondas (ADR 0016): o funcionário inicia uma rota atribuída a ele, lê o QR de cada ponto e
 * encerra. Os check-ins são append-only; a ronda só muda ao ser encerrada.
 */
@Injectable()
export class PatrolRunsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly company: CompanyService,
    private readonly employees: EmployeesService,
  ) {}

  // ─── Área pessoal ─────────────────────────────────────────────────────────────────

  async mine(userId: string): Promise<MyPatrols> {
    const employee = await this.ownEmployee(userId);
    const companyTz = await this.company.timezone();
    const now = new Date();
    const routes = await this.db.client.patrolRoute.findMany({
      where: { isActive: true, assignees: { some: { employeeId: employee.id } } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        expectedMinutes: true,
        startMinutes: true,
        weekdays: true,
        unit: { select: { id: true, name: true, timezone: true } },
        _count: { select: { points: true } },
      },
    });
    const current = await this.db.client.patrolRun.findFirst({
      where: { employeeId: employee.id, status: 'in_progress' },
      select: RUN_SELECT,
    });

    const result: MyPatrols['routes'] = [];
    for (const route of routes) {
      const timezone = route.unit.timezone ?? companyTz;
      const slots = await this.slotsFor(route, todayIn(timezone, now), timezone, now);
      result.push({
        id: route.id,
        name: route.name,
        unit: { id: route.unit.id, name: route.unit.name },
        expectedMinutes: route.expectedMinutes,
        pointsCount: route._count.points,
        slots,
      });
    }
    return { routes: result, current: current ? await this.toRun(current, companyTz) : null };
  }

  async start(routeId: string, grant: AccessGrant): Promise<PatrolRun> {
    const employee = await this.ownEmployee(grant.userId);
    const companyTz = await this.company.timezone();
    const today = todayIn(companyTz);
    if (employee.terminationDate && fromCalendarDate(employee.terminationDate) < today) {
      throw problem(
        ProblemType.EmployeeTerminated,
        HttpStatus.FORBIDDEN,
        'Funcionário desligado não inicia rondas.',
      );
    }
    const route = await this.db.client.patrolRoute.findFirst({
      where: { id: routeId, isActive: true, assignees: { some: { employeeId: employee.id } } },
      select: {
        id: true,
        unitId: true,
        expectedMinutes: true,
        enforceOrder: true,
        startMinutes: true,
        weekdays: true,
        unit: { select: { timezone: true } },
        points: {
          where: { point: { isActive: true } },
          orderBy: { position: 'asc' },
          select: { pointId: true },
        },
      },
    });
    if (!route) {
      throw problem(
        ProblemType.PatrolNotAssigned,
        HttpStatus.FORBIDDEN,
        'Esta rota não está atribuída a você ou está inativa.',
      );
    }
    if (route.points.length === 0) {
      throw invalidReference('routeId', 'A rota não tem pontos ativos.');
    }
    const open = await this.db.client.patrolRun.count({
      where: { employeeId: employee.id, status: 'in_progress' },
    });
    if (open > 0) throw runOpen();

    // Horário previsto que esta ronda cumpre (hoje ou o fim da noite anterior).
    const now = new Date();
    const timezone = route.unit.timezone ?? companyTz;
    const localToday = todayIn(timezone, now);
    const candidates = [
      ...slotsOn(route, addDays(localToday, -1), timezone),
      ...slotsOn(route, localToday, timezone),
    ];
    const taken = await this.db.client.patrolRun.findMany({
      where: { routeId: route.id, scheduledFor: { in: candidates } },
      select: { scheduledFor: true },
    });
    const scheduledFor = pickSlot(
      candidates,
      new Set(taken.map((t) => t.scheduledFor?.getTime() ?? 0)),
      now,
      route.expectedMinutes,
    );

    const create = (slot: Date | null) =>
      this.db.client.patrolRun.create({
        data: {
          companyId: grant.companyId,
          routeId: route.id,
          employeeId: employee.id,
          unitId: route.unitId,
          pointIds: route.points.map((p) => p.pointId),
          enforceOrder: route.enforceOrder,
          scheduledFor: slot,
          startedAt: now,
          expectedEndAt: new Date(now.getTime() + route.expectedMinutes * 60_000),
        },
        select: RUN_SELECT,
      });
    try {
      return await this.toRun(await create(scheduledFor), companyTz);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Corrida: outra ronda aberta do mesmo funcionário, ou o horário foi pego por outro.
      const stillOpen = await this.db.client.patrolRun.count({
        where: { employeeId: employee.id, status: 'in_progress' },
      });
      if (stillOpen > 0) throw runOpen();
      return this.toRun(await create(null), companyTz);
    }
  }

  async checkin(
    runId: string,
    input: CheckinInput,
    grant: AccessGrant,
    client: PatrolClient,
  ): Promise<PatrolRun> {
    const run = await this.ownRun(runId, grant.userId);
    if (run.status !== 'in_progress') throw runFinished();

    const parsed = parsePatrolCode(input.code);
    if (!parsed) throw invalidCode('Este QR code não é de um ponto de ronda.');
    if (!run.pointIds.includes(parsed.pointId)) {
      throw problem(
        ProblemType.PatrolPointNotInRun,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Este ponto não faz parte desta ronda.',
      );
    }
    const point = await this.db.client.patrolPoint.findUnique({
      where: { id: parsed.pointId },
      select: {
        codeToken: true,
        codeVersion: true,
        latitude: true,
        longitude: true,
        radiusMeters: true,
      },
    });
    if (!point || !tokensMatch(point.codeToken, parsed.token)) {
      throw invalidCode('QR code desatualizado ou inválido. Avise a gestão para reimprimir.');
    }
    const checked = new Set(run.checkins.map((c) => c.pointId));
    if (checked.has(parsed.pointId)) throw alreadyChecked();

    const expected = run.pointIds.find((id) => !checked.has(id));
    const outOfOrder = expected !== parsed.pointId;
    if (outOfOrder && run.enforceOrder) {
      throw problem(
        ProblemType.PatrolOutOfOrder,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Esta rota exige os pontos na ordem. Leia primeiro o próximo ponto indicado.',
      );
    }

    const position =
      input.latitude !== null &&
      input.latitude !== undefined &&
      input.longitude !== null &&
      input.longitude !== undefined
        ? { latitude: input.latitude, longitude: input.longitude }
        : null;
    const fence = evaluateGeofence(
      {
        latitude: point.latitude,
        longitude: point.longitude,
        geofenceRadiusMeters: point.radiusMeters,
      },
      position,
    );
    const official = resolveOfflineTime({
      offlineRecordedAt: input.offlineRecordedAt,
      source: client.source,
      now: new Date(),
      notBefore: run.startedAt,
    });
    if (!official.ok) {
      throw problem(
        ProblemType.OfflineEntryRejected,
        HttpStatus.UNPROCESSABLE_ENTITY,
        official.reason,
      );
    }
    const now = official.recordedAt ?? new Date();
    const complete = checked.size + 1 === run.pointIds.length;

    try {
      await this.db.client.$transaction(async (tx) => {
        await tx.patrolCheckin.create({
          data: {
            companyId: grant.companyId,
            runId: run.id,
            pointId: parsed.pointId,
            employeeId: run.employee.id,
            recordedAt: now,
            deviceRecordedAt: input.deviceTimestamp ? new Date(input.deviceTimestamp) : null,
            codeVersion: point.codeVersion,
            latitude: position?.latitude ?? null,
            longitude: position?.longitude ?? null,
            accuracyMeters: input.accuracyMeters ?? null,
            distanceMeters: fence.distanceMeters,
            geofenceStatus: fence.status,
            outOfOrder,
            source: official.offline ? OFFLINE_SOURCE : client.source,
            ipAddress: client.ip,
            userAgent: client.userAgent,
          },
        });
        // Último ponto: a ronda se encerra sozinha.
        if (complete) {
          await tx.patrolRun.update({
            where: { id: run.id },
            data: { status: 'completed', finishedAt: now },
          });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw alreadyChecked();
      throw error;
    }
    return this.toRun(await this.load(run.id), await this.company.timezone());
  }

  async finish(runId: string, note: string | null, grant: AccessGrant): Promise<PatrolRun> {
    const run = await this.ownRun(runId, grant.userId);
    if (run.status !== 'in_progress') throw runFinished();
    const missing = run.pointIds.length - run.checkins.length;
    if (missing > 0 && !note) {
      throw invalidReference('note', 'Explique por que a ronda termina sem todos os pontos.');
    }
    await this.db.client.patrolRun.update({
      where: { id: run.id },
      data: {
        status: missing > 0 ? 'incomplete' : 'completed',
        finishedAt: new Date(),
        finishNote: note,
      },
    });
    return this.toRun(await this.load(run.id), await this.company.timezone());
  }

  // ─── Gestão ───────────────────────────────────────────────────────────────────────

  /**
   * Quadro do dia: rondas iniciadas na data e horários previstos, no escopo de
   * `patrols:read` (pelo funcionário que faz a ronda). As rondas de quem consulta ficam de
   * fora (segregação: ficam na área pessoal).
   */
  async board(date: string, grant: AccessGrant): Promise<PatrolBoard> {
    if (!grant.scope) return { date, runs: [], slots: [] };
    const actor = await this.employees.actor(grant);
    const scope = employeeScopeWhere(grant.scope, actor);
    if (!scope) return { date, runs: [], slots: [] };
    const employeeWhere = {
      AND: [scope, ...(actor.employeeId ? [{ id: { not: actor.employeeId } }] : [])],
    };
    const companyTz = await this.company.timezone();
    const now = new Date();

    // Janela larga para qualquer fuso; o recorte é pela data local da unidade.
    const rows = await this.db.client.patrolRun.findMany({
      where: {
        employee: employeeWhere,
        startedAt: {
          gte: new Date(`${addDays(date, -1)}T00:00:00Z`),
          lt: new Date(`${addDays(date, 2)}T00:00:00Z`),
        },
      },
      orderBy: { startedAt: 'desc' },
      select: RUN_SELECT,
    });
    const runs = rows.filter(
      (row) => toZoned(row.startedAt, row.unit.timezone ?? companyTz).date === date,
    );

    const routes = await this.db.client.patrolRoute.findMany({
      where: {
        isActive: true,
        weekdays: { isEmpty: false },
        ...(grant.scope.companyWide ? {} : { assignees: { some: { employee: employeeWhere } } }),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        expectedMinutes: true,
        startMinutes: true,
        weekdays: true,
        unit: { select: { id: true, name: true, timezone: true } },
      },
    });
    const visible = new Set(runs.map((r) => r.id));
    const slots: PatrolSlot[] = [];
    for (const route of routes) {
      const timezone = route.unit.timezone ?? companyTz;
      for (const slot of await this.slotsFor(route, date, timezone, now)) {
        slots.push({ ...slot, runId: slot.runId && visible.has(slot.runId) ? slot.runId : null });
      }
    }
    slots.sort((a, b) => a.at.localeCompare(b.at));

    return {
      date,
      runs: await Promise.all(runs.map((row) => this.toRun(row, companyTz, now))),
      slots,
    };
  }

  async get(id: string, grant: AccessGrant): Promise<PatrolRun> {
    const row = await this.db.client.patrolRun.findUnique({ where: { id }, select: RUN_SELECT });
    if (!row) throw new NotFoundException('Ronda não encontrada.');
    // Fora do escopo responde como inexistente.
    await this.employees.get(row.employee.id, grant);
    return this.toRun(row, await this.company.timezone());
  }

  // ─── Interno ──────────────────────────────────────────────────────────────────────

  private async slotsFor(
    route: {
      id: string;
      name: string;
      expectedMinutes: number;
      startMinutes: number[];
      weekdays: number[];
      unit: { id: string; name: string };
    },
    date: string,
    timezone: string,
    now: Date,
  ): Promise<PatrolSlot[]> {
    const instants = slotsOn(route, date, timezone);
    if (instants.length === 0) return [];
    const runs = await this.db.client.patrolRun.findMany({
      where: { routeId: route.id, scheduledFor: { in: instants } },
      select: { id: true, scheduledFor: true, status: true },
    });
    return instants.map((at) => {
      const run = runs.find((r) => r.scheduledFor?.getTime() === at.getTime()) ?? null;
      return {
        route: { id: route.id, name: route.name },
        unit: { id: route.unit.id, name: route.unit.name },
        at: at.toISOString(),
        localTime: toZoned(at, timezone).time,
        status: slotStatus(at, route.expectedMinutes, run, now),
        runId: run?.id ?? null,
      };
    });
  }

  private async ownEmployee(userId: string) {
    const employee = await this.db.client.employee.findUnique({
      where: { userId },
      select: { id: true, terminationDate: true },
    });
    if (!employee) {
      throw problem(
        ProblemType.NoEmployeeRecord,
        HttpStatus.FORBIDDEN,
        'Seu usuário não está ligado a um cadastro de funcionário.',
      );
    }
    return employee;
  }

  /** Ronda do próprio usuário; a de outra pessoa responde como inexistente. */
  private async ownRun(runId: string, userId: string): Promise<RunRow> {
    const run = await this.db.client.patrolRun.findUnique({
      where: { id: runId },
      select: RUN_SELECT,
    });
    if (run?.employee.userId !== userId) throw new NotFoundException('Ronda não encontrada.');
    return run;
  }

  private load(runId: string): Promise<RunRow> {
    return this.db.client.patrolRun.findUniqueOrThrow({
      where: { id: runId },
      select: RUN_SELECT,
    });
  }

  private async toRun(row: RunRow, companyTz: string, now = new Date()): Promise<PatrolRun> {
    const timezone = row.unit.timezone ?? companyTz;
    const points = await this.db.client.patrolPoint.findMany({
      where: { id: { in: row.pointIds } },
      select: { id: true, name: true },
    });
    const names = new Map(points.map((p) => [p.id, p.name]));
    const checkins = new Map(row.checkins.map((c) => [c.pointId, c]));
    const ordered = row.pointIds.map((id) => {
      const checkin = checkins.get(id);
      return {
        id,
        name: names.get(id) ?? 'Ponto removido',
        checkin: checkin
          ? {
              id: checkin.id,
              recordedAt: checkin.recordedAt.toISOString(),
              localTime: toZoned(checkin.recordedAt, timezone).time,
              geofenceStatus: checkin.geofenceStatus,
              distanceMeters: checkin.distanceMeters,
              outOfOrder: checkin.outOfOrder,
              offline: checkin.source === OFFLINE_SOURCE,
            }
          : null,
      };
    });
    const next = row.status === 'in_progress' ? ordered.find((p) => !p.checkin) : undefined;
    return {
      id: row.id,
      route: row.route,
      unit: { id: row.unit.id, name: row.unit.name },
      employee: { id: row.employee.id, name: row.employee.socialName ?? row.employee.name },
      timezone,
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
      startedAt: row.startedAt.toISOString(),
      expectedEndAt: row.expectedEndAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      status: row.status,
      finishNote: row.finishNote,
      enforceOrder: row.enforceOrder,
      points: ordered,
      checked: row.checkins.length,
      total: row.pointIds.length,
      lateMinutes: lateMinutes(row.expectedEndAt, row.finishedAt, now),
      nextPoint: next ? { id: next.id, name: next.name } : null,
    };
  }
}

function runOpen(): ProblemException {
  return problem(
    ProblemType.PatrolRunOpen,
    HttpStatus.CONFLICT,
    'Você já tem uma ronda em andamento. Encerre-a antes de iniciar outra.',
  );
}

function runFinished(): ProblemException {
  return problem(
    ProblemType.PatrolRunFinished,
    HttpStatus.CONFLICT,
    'Esta ronda já foi encerrada.',
  );
}

function invalidCode(detail: string): ProblemException {
  return problem(ProblemType.PatrolInvalidCode, HttpStatus.UNPROCESSABLE_ENTITY, detail);
}

function alreadyChecked(): ProblemException {
  return problem(
    ProblemType.PatrolPointAlreadyChecked,
    HttpStatus.CONFLICT,
    'Este ponto já foi registrado nesta ronda.',
  );
}
