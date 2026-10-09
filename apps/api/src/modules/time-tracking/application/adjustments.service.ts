import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { type Adjustment, type adjustmentInputSchema, ProblemType } from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { Prisma } from '../../../generated/prisma/client';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { CompanyService } from '../../organization/application/company.service';
import { invalidReference } from '../../organization/application/catalog-rules';
import { EmployeesService } from '../../workforce/application/employees.service';
import { employeeScopeWhere } from '../../workforce/domain/employee-scope';
import { fromZoned, toZoned } from '../domain/zoned-time';
import { TimeEntryWriter } from './time-entry-writer';
import { TimeTrackingService } from './time-tracking.service';

type AdjustmentInput = z.output<typeof adjustmentInputSchema>;

const ADJUSTMENT_SELECT = {
  id: true,
  employeeId: true,
  type: true,
  proposedAt: true,
  targetEntryId: true,
  reason: true,
  status: true,
  requestedBy: true,
  decidedBy: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      name: true,
      socialName: true,
      unit: { select: { id: true, timezone: true } },
    },
  },
} as const;

type AdjustmentRow = Prisma.TimeAdjustmentRequestGetPayload<{ select: typeof ADJUSTMENT_SELECT }>;

function notPending(): ProblemException {
  return new ProblemException({
    type: ProblemType.AdjustmentNotPending,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail: 'Esta solicitação já foi decidida ou cancelada.',
  });
}

/**
 * Ajustes de ponto: o funcionário (ou o RH, em nome dele) pede a inclusão de uma marcação
 * que faltou ou a desconsideração de uma marcação; o aprovador decide. Aprovado, o ajuste
 * vira uma nova marcação (inclusão ou desconsideração) — a original nunca é alterada.
 */
@Injectable()
export class AdjustmentsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly writer: TimeEntryWriter,
    private readonly timeTracking: TimeTrackingService,
    private readonly employees: EmployeesService,
    private readonly company: CompanyService,
    private readonly audit: AuditService,
  ) {}

  /** Solicitação do próprio funcionário. */
  async requestMine(input: AdjustmentInput, grant: AccessGrant): Promise<Adjustment> {
    const own = await this.db.client.employee.findUnique({
      where: { userId: grant.userId },
      select: { id: true },
    });
    if (!own)
      throw new NotFoundException('Seu usuário não está ligado a um cadastro de funcionário.');
    return this.create(own.id, input, grant);
  }

  /** Solicitação em nome de um funcionário do escopo (`time_entries:manage`). */
  async requestFor(
    employeeId: string,
    input: AdjustmentInput,
    grant: AccessGrant,
  ): Promise<Adjustment> {
    await this.employees.get(employeeId, grant);
    return this.create(employeeId, input, grant);
  }

  async listMine(userId: string): Promise<Adjustment[]> {
    const rows = await this.db.client.timeAdjustmentRequest.findMany({
      where: { employee: { userId } },
      select: ADJUSTMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return this.toAdjustments(rows);
  }

  /**
   * Solicitações dos funcionários no escopo da permissão de aprovação. As do próprio aprovador
   * ficam de fora: ele não pode decidi-las (segregação) e as acompanha na área pessoal.
   */
  async listForApprover(
    status: Adjustment['status'] | undefined,
    grant: AccessGrant,
  ): Promise<Adjustment[]> {
    if (!grant.scope) return [];
    const actor = await this.employees.actor(grant);
    const scope = employeeScopeWhere(grant.scope, actor);
    if (!scope) return [];
    const rows = await this.db.client.timeAdjustmentRequest.findMany({
      where: {
        ...(status ? { status } : {}),
        employee: {
          AND: [scope, ...(actor.employeeId ? [{ id: { not: actor.employeeId } }] : [])],
        },
      },
      select: ADJUSTMENT_SELECT,
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return this.toAdjustments(rows);
  }

  async approve(id: string, note: string | null, grant: AccessGrant): Promise<Adjustment> {
    const request = await this.decidable(id, grant);
    const employee = await this.timeTracking.employeeContext(request.employeeId);

    await this.db.client.$transaction(async (tx) => {
      // Consome a solicitação de forma atômica: só uma decisão vence.
      const claimed = await tx.timeAdjustmentRequest.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'approved',
          decidedBy: grant.userId,
          decidedAt: new Date(),
          decisionNote: note,
        },
      });
      if (claimed.count === 0) throw notPending();

      let resultEntryId: string;
      if (request.type === 'include') {
        const entry = await this.writer.append(tx, {
          companyId: grant.companyId,
          employeeId: request.employeeId,
          unitId: employee.unit.id,
          kind: 'inclusion',
          recordedAt: request.proposedAt,
          adjustmentRequestId: id,
          geofenceStatus: 'no_location',
          source: 'adjustment',
          createdBy: grant.userId,
        });
        resultEntryId = entry.id;
      } else {
        const target = await tx.timeEntry.findUnique({
          where: { id: request.targetEntryId ?? '' },
          select: { id: true, unitId: true, employeeId: true },
        });
        const already = await tx.timeEntry.count({
          where: { referencesEntryId: request.targetEntryId, kind: 'disregard' },
        });
        if (target?.employeeId !== request.employeeId || already > 0) throw notPending();
        const entry = await this.writer.append(tx, {
          companyId: grant.companyId,
          employeeId: request.employeeId,
          unitId: target.unitId,
          kind: 'disregard',
          recordedAt: null,
          referencesEntryId: target.id,
          adjustmentRequestId: id,
          geofenceStatus: 'no_location',
          source: 'adjustment',
          createdBy: grant.userId,
        });
        resultEntryId = entry.id;
      }
      await tx.timeAdjustmentRequest.update({ where: { id }, data: { resultEntryId } });
      await this.audit.record(
        {
          action: 'time_adjustment.approved',
          resourceType: 'time_adjustment',
          resourceId: id,
          metadata: { employeeId: request.employeeId, type: request.type, resultEntryId, note },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async reject(id: string, note: string | null, grant: AccessGrant): Promise<Adjustment> {
    if (!note) {
      throw invalidReference('note', 'Informe o motivo da recusa.');
    }
    const request = await this.decidable(id, grant);
    await this.db.client.$transaction(async (tx) => {
      const claimed = await tx.timeAdjustmentRequest.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'rejected',
          decidedBy: grant.userId,
          decidedAt: new Date(),
          decisionNote: note,
        },
      });
      if (claimed.count === 0) throw notPending();
      await this.audit.record(
        {
          action: 'time_adjustment.rejected',
          resourceType: 'time_adjustment',
          resourceId: id,
          metadata: { employeeId: request.employeeId, note },
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Quem pediu pode desistir enquanto estiver pendente. */
  async cancel(id: string, grant: AccessGrant): Promise<Adjustment> {
    const updated = await this.db.client.timeAdjustmentRequest.updateMany({
      where: { id, status: 'pending', requestedBy: grant.userId },
      data: { status: 'cancelled', decidedAt: new Date() },
    });
    if (updated.count === 0) throw notPending();
    return this.get(id);
  }

  // ─── Interno ──────────────────────────────────────────────────────────────────────

  private async create(
    employeeId: string,
    input: AdjustmentInput,
    grant: AccessGrant,
  ): Promise<Adjustment> {
    const employee = await this.timeTracking.employeeContext(employeeId);
    const timezone = employee.unit.timezone ?? (await this.company.timezone());
    let proposedAt: Date | null = null;
    let targetEntryId: string | null = null;

    if (input.type === 'include') {
      proposedAt = fromZoned(input.date, input.time, timezone);
      if (proposedAt.getTime() > Date.now()) {
        throw invalidReference('time', 'Não é possível incluir marcação no futuro.');
      }
    } else {
      const target = await this.db.client.timeEntry.findUnique({
        where: { id: input.targetEntryId },
        select: { employeeId: true, kind: true },
      });
      if (target?.employeeId !== employeeId || target.kind === 'disregard') {
        throw invalidReference('targetEntryId', 'Marcação não encontrada para este funcionário.');
      }
      const already = await this.db.client.timeEntry.count({
        where: { referencesEntryId: input.targetEntryId, kind: 'disregard' },
      });
      if (already > 0)
        throw invalidReference('targetEntryId', 'Esta marcação já foi desconsiderada.');
      targetEntryId = input.targetEntryId;
    }

    const row = await this.db.client.$transaction(async (tx) => {
      const created = await tx.timeAdjustmentRequest.create({
        data: {
          companyId: grant.companyId,
          employeeId,
          type: input.type,
          proposedAt,
          targetEntryId,
          reason: input.reason,
          requestedBy: grant.userId,
        },
        select: ADJUSTMENT_SELECT,
      });
      await this.audit.record(
        {
          action: 'time_adjustment.requested',
          resourceType: 'time_adjustment',
          resourceId: created.id,
          metadata: { employeeId, type: input.type },
        },
        tx,
      );
      return created;
    });
    const [adjustment] = await this.toAdjustments([row]);
    if (!adjustment) throw new NotFoundException();
    return adjustment;
  }

  /** Pendente, no escopo do aprovador e não pedida por ele mesmo. */
  private async decidable(id: string, grant: AccessGrant) {
    const request = await this.db.client.timeAdjustmentRequest.findUnique({
      where: { id },
      select: {
        employeeId: true,
        type: true,
        proposedAt: true,
        targetEntryId: true,
        status: true,
        requestedBy: true,
        employee: { select: { userId: true } },
      },
    });
    if (!request) throw new NotFoundException('Solicitação não encontrada.');
    await this.employees.get(request.employeeId, grant);
    if (request.status !== 'pending') throw notPending();
    if (request.requestedBy === grant.userId || request.employee.userId === grant.userId) {
      throw new ProblemException({
        type: ProblemType.SelfApproval,
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Você não pode decidir um ajuste do seu próprio ponto ou pedido por você.',
      });
    }
    return request;
  }

  private async get(id: string): Promise<Adjustment> {
    const row = await this.db.client.timeAdjustmentRequest.findUniqueOrThrow({
      where: { id },
      select: ADJUSTMENT_SELECT,
    });
    const [adjustment] = await this.toAdjustments([row]);
    if (!adjustment) throw new NotFoundException();
    return adjustment;
  }

  private async toAdjustments(rows: AdjustmentRow[]): Promise<Adjustment[]> {
    const companyTz = await this.company.timezone();
    const targetIds = rows.map((r) => r.targetEntryId).filter((id): id is string => id !== null);
    const targets = targetIds.length
      ? await this.db.client.timeEntry.findMany({
          where: { id: { in: targetIds } },
          select: { id: true, recordedAt: true },
        })
      : [];
    return rows.map((row) => {
      const timezone = row.employee.unit.timezone ?? companyTz;
      const target = targets.find((t) => t.id === row.targetEntryId);
      const targetLocal = target ? toZoned(target.recordedAt, timezone) : null;
      const proposedLocal = row.proposedAt ? toZoned(row.proposedAt, timezone) : null;
      return {
        id: row.id,
        employee: { id: row.employee.id, name: row.employee.socialName ?? row.employee.name },
        type: row.type,
        proposedAt: row.proposedAt?.toISOString() ?? null,
        proposedLocal: proposedLocal ? `${proposedLocal.date} ${proposedLocal.time}` : null,
        targetEntry:
          target && targetLocal
            ? { id: target.id, localDate: targetLocal.date, localTime: targetLocal.time }
            : null,
        reason: row.reason,
        status: row.status,
        requestedBy: row.requestedBy,
        decidedBy: row.decidedBy,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        decisionNote: row.decisionNote,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
