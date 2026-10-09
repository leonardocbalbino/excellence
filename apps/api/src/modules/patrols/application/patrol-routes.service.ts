import { Injectable, NotFoundException } from '@nestjs/common';
import {
  minutesToTime,
  type PatrolRoute,
  type patrolRouteInputSchema,
  timeToMinutes,
} from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { duplicated, inUse, invalidReference } from '../../organization/application/catalog-rules';
import { CompanyService } from '../../organization/application/company.service';
import { toCalendarDate, todayIn } from '../../workforce/domain/calendar';

type RouteInput = z.output<typeof patrolRouteInputSchema>;

export const ROUTE_SELECT = {
  id: true,
  name: true,
  description: true,
  expectedMinutes: true,
  enforceOrder: true,
  startMinutes: true,
  weekdays: true,
  isActive: true,
  unit: { select: { id: true, name: true, timezone: true } },
  points: {
    orderBy: { position: 'asc' },
    select: { point: { select: { id: true, name: true } } },
  },
  assignees: {
    orderBy: { employee: { name: 'asc' } },
    select: { employee: { select: { id: true, name: true, socialName: true } } },
  },
} as const;

export interface RouteRow {
  id: string;
  name: string;
  description: string | null;
  expectedMinutes: number;
  enforceOrder: boolean;
  startMinutes: number[];
  weekdays: number[];
  isActive: boolean;
  unit: { id: string; name: string; timezone: string | null };
  points: { point: { id: string; name: string } }[];
  assignees: { employee: { id: string; name: string; socialName: string | null } }[];
}

export function toRoute(row: RouteRow): PatrolRoute {
  return {
    id: row.id,
    unit: { id: row.unit.id, name: row.unit.name },
    name: row.name,
    description: row.description,
    expectedMinutes: row.expectedMinutes,
    enforceOrder: row.enforceOrder,
    points: row.points.map((p) => p.point),
    startTimes: [...row.startMinutes].sort((a, b) => a - b).map(minutesToTime),
    weekdays: [...row.weekdays].sort((a, b) => a - b),
    assignees: row.assignees.map(({ employee }) => ({
      id: employee.id,
      name: employee.socialName ?? employee.name,
    })),
    isActive: row.isActive,
  };
}

/** Rotas de ronda: pontos em ordem, tempo previsto, horários e quem faz (ADR 0016). */
@Injectable()
export class PatrolRoutesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly company: CompanyService,
  ) {}

  async list(includeInactive: boolean): Promise<PatrolRoute[]> {
    const rows = await this.db.client.patrolRoute.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: ROUTE_SELECT,
      orderBy: [{ unit: { name: 'asc' } }, { name: 'asc' }],
    });
    return rows.map(toRoute);
  }

  async get(id: string): Promise<PatrolRoute> {
    const row = await this.db.client.patrolRoute.findUnique({
      where: { id },
      select: ROUTE_SELECT,
    });
    if (!row) throw new NotFoundException('Rota não encontrada.');
    return toRoute(row);
  }

  async save(id: string | null, input: RouteInput, grant: AccessGrant): Promise<PatrolRoute> {
    assertCompanyWide(grant);
    const before = id ? await this.get(id) : null;
    await this.checkReferences(input);
    const taken = await this.db.client.patrolRoute.count({
      where: { unitId: input.unitId, name: input.name, ...(id ? { id: { not: id } } : {}) },
    });
    if (taken > 0) throw duplicated('name', 'Já existe uma rota com este nome no posto.');

    const data = {
      unitId: input.unitId,
      name: input.name,
      description: input.description,
      expectedMinutes: input.expectedMinutes,
      enforceOrder: input.enforceOrder,
      startMinutes: input.startTimes.map(timeToMinutes),
      weekdays: input.weekdays,
      isActive: input.isActive,
    };
    return this.db.client.$transaction(async (tx) => {
      const routeId = id
        ? (await tx.patrolRoute.update({ where: { id }, data, select: { id: true } })).id
        : (
            await tx.patrolRoute.create({
              data: { ...data, companyId: grant.companyId },
              select: { id: true },
            })
          ).id;
      // Pontos e responsáveis são substituídos por inteiro (as rondas já feitas guardam os
      // pontos que tinham ao iniciar).
      await tx.patrolRoutePoint.deleteMany({ where: { routeId } });
      await tx.patrolRoutePoint.createMany({
        data: input.pointIds.map((pointId, position) => ({
          routeId,
          pointId,
          position,
          companyId: grant.companyId,
        })),
      });
      await tx.patrolRouteAssignee.deleteMany({ where: { routeId } });
      if (input.assigneeIds.length > 0) {
        await tx.patrolRouteAssignee.createMany({
          data: input.assigneeIds.map((employeeId) => ({
            routeId,
            employeeId,
            companyId: grant.companyId,
          })),
        });
      }
      const after = toRoute(
        await tx.patrolRoute.findUniqueOrThrow({ where: { id: routeId }, select: ROUTE_SELECT }),
      );
      await this.audit.record(
        {
          action: id ? 'patrol_route.updated' : 'patrol_route.created',
          resourceType: 'patrol_route',
          resourceId: routeId,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }

  async remove(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.patrolRoute.findUnique({
      where: { id },
      select: { name: true, _count: { select: { runs: true } } },
    });
    if (!row) throw new NotFoundException('Rota não encontrada.');
    if (row._count.runs > 0) throw inUse('A rota já tem rondas registradas.');
    await this.db.client.$transaction(async (tx) => {
      await tx.patrolRoute.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'patrol_route.deleted',
          resourceType: 'patrol_route',
          resourceId: id,
          metadata: { name: row.name },
        },
        tx,
      );
    });
  }

  /** Unidade ativa, pontos ativos da mesma unidade e responsáveis ativos. */
  private async checkReferences(input: RouteInput): Promise<void> {
    const unit = await this.db.client.unit.findUnique({
      where: { id: input.unitId },
      select: { isActive: true },
    });
    if (!unit?.isActive)
      throw invalidReference('unitId', 'Posto de trabalho não encontrado ou inativo.');

    const points = await this.db.client.patrolPoint.count({
      where: { id: { in: input.pointIds }, unitId: input.unitId, isActive: true },
    });
    if (points !== input.pointIds.length) {
      throw invalidReference('pointIds', 'Use só pontos ativos do mesmo posto da rota.');
    }

    if (input.assigneeIds.length > 0) {
      const today = toCalendarDate(todayIn(await this.company.timezone()));
      const employees = await this.db.client.employee.count({
        where: {
          id: { in: input.assigneeIds },
          OR: [{ terminationDate: null }, { terminationDate: { gte: today } }],
        },
      });
      if (employees !== input.assigneeIds.length) {
        throw invalidReference('assigneeIds', 'Há funcionários inexistentes ou desligados.');
      }
    }
  }
}
