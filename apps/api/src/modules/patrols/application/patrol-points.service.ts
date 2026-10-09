import { Injectable, NotFoundException } from '@nestjs/common';
import type { PatrolPoint, patrolPointInputSchema } from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { duplicated, inUse, invalidReference } from '../../organization/application/catalog-rules';
import { formatCode, newCodeToken } from '../domain/code';

type PointInput = z.output<typeof patrolPointInputSchema>;

const POINT_SELECT = {
  id: true,
  name: true,
  description: true,
  latitude: true,
  longitude: true,
  radiusMeters: true,
  codeToken: true,
  codeVersion: true,
  isActive: true,
  unit: { select: { id: true, name: true } },
} as const;

interface PointRow {
  id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  codeToken: string;
  codeVersion: number;
  isActive: boolean;
  unit: { id: string; name: string };
}

function toPoint(row: PointRow): PatrolPoint {
  return {
    id: row.id,
    unit: row.unit,
    name: row.name,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radiusMeters,
    isActive: row.isActive,
    code: formatCode(row.id, row.codeToken),
    codeVersion: row.codeVersion,
  };
}

/** Sem o conteúdo do QR: a auditoria não guarda o token. */
function auditView(point: PatrolPoint) {
  const { code: _code, ...rest } = point;
  return rest;
}

/** Pontos de ronda (ADR 0016). O token do QR só sai na gestão (`patrols:manage`). */
@Injectable()
export class PatrolPointsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive: boolean): Promise<PatrolPoint[]> {
    const rows = await this.db.client.patrolPoint.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: POINT_SELECT,
      orderBy: [{ unit: { name: 'asc' } }, { name: 'asc' }],
    });
    return rows.map(toPoint);
  }

  async get(id: string): Promise<PatrolPoint> {
    const row = await this.db.client.patrolPoint.findUnique({
      where: { id },
      select: POINT_SELECT,
    });
    if (!row) throw new NotFoundException('Ponto de ronda não encontrado.');
    return toPoint(row);
  }

  async save(id: string | null, input: PointInput, grant: AccessGrant): Promise<PatrolPoint> {
    assertCompanyWide(grant);
    const before = id ? await this.get(id) : null;
    const unit = await this.db.client.unit.findUnique({
      where: { id: input.unitId },
      select: { isActive: true },
    });
    if (!unit?.isActive)
      throw invalidReference('unitId', 'Posto de trabalho não encontrado ou inativo.');
    if (before && before.unit.id !== input.unitId) {
      const routes = await this.db.client.patrolRoutePoint.count({ where: { pointId: before.id } });
      if (routes > 0) {
        throw invalidReference('unitId', 'O ponto está em rotas: tire-o das rotas antes.');
      }
    }
    const taken = await this.db.client.patrolPoint.count({
      where: { unitId: input.unitId, name: input.name, ...(id ? { id: { not: id } } : {}) },
    });
    if (taken > 0) throw duplicated('name', 'Já existe um ponto com este nome no posto.');

    const data = {
      unitId: input.unitId,
      name: input.name,
      description: input.description,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      radiusMeters: input.radiusMeters ?? null,
      isActive: input.isActive,
    };
    return this.db.client.$transaction(async (tx) => {
      const row = id
        ? await tx.patrolPoint.update({ where: { id }, data, select: POINT_SELECT })
        : await tx.patrolPoint.create({
            data: { ...data, companyId: grant.companyId, codeToken: newCodeToken() },
            select: POINT_SELECT,
          });
      const after = toPoint(row);
      await this.audit.record(
        {
          action: id ? 'patrol_point.updated' : 'patrol_point.created',
          resourceType: 'patrol_point',
          resourceId: after.id,
          metadata: toAuditJson({
            before: before ? auditView(before) : null,
            after: auditView(after),
          }),
        },
        tx,
      );
      return after;
    });
  }

  /** Novo QR: o impresso antes deixa de valer na hora. */
  async regenerateCode(id: string, grant: AccessGrant): Promise<PatrolPoint> {
    assertCompanyWide(grant);
    await this.get(id);
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.patrolPoint.update({
        where: { id },
        data: { codeToken: newCodeToken(), codeVersion: { increment: 1 } },
        select: POINT_SELECT,
      });
      await this.audit.record(
        {
          action: 'patrol_point.code_regenerated',
          resourceType: 'patrol_point',
          resourceId: id,
          metadata: { codeVersion: row.codeVersion },
        },
        tx,
      );
      return toPoint(row);
    });
  }

  async remove(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.patrolPoint.findUnique({
      where: { id },
      select: { name: true, _count: { select: { routePoints: true, checkins: true } } },
    });
    if (!row) throw new NotFoundException('Ponto de ronda não encontrado.');
    if (row._count.routePoints > 0 || row._count.checkins > 0) {
      throw inUse('O ponto está em rotas ou já recebeu check-ins.');
    }
    await this.db.client.$transaction(async (tx) => {
      await tx.patrolPoint.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'patrol_point.deleted',
          resourceType: 'patrol_point',
          resourceId: id,
          metadata: { name: row.name },
        },
        tx,
      );
    });
  }
}
