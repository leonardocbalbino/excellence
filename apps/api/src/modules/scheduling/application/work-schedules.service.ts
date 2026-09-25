import { Injectable, NotFoundException } from '@nestjs/common';
import type { WorkSchedule, workScheduleInputSchema } from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { duplicated, inUse, invalidReference } from '../../organization/application/catalog-rules';

type WorkScheduleInput = z.output<typeof workScheduleInputSchema>;

const SCHEDULE_SELECT = {
  id: true,
  name: true,
  code: true,
  kind: true,
  cycleAnchor: true,
  weeklyMinutes: true,
  notes: true,
  isActive: true,
  days: { select: { dayIndex: true, shiftId: true }, orderBy: { dayIndex: 'asc' } },
  _count: { select: { assignments: { where: { endDate: null } } } },
} as const;

interface ScheduleRow {
  id: string;
  name: string;
  code: string | null;
  kind: 'cycle' | 'flexible';
  cycleAnchor: 'monday' | 'assignment' | null;
  weeklyMinutes: number | null;
  notes: string | null;
  isActive: boolean;
  days: { dayIndex: number; shiftId: string | null }[];
  _count: { assignments: number };
}

function toSchedule(row: ScheduleRow): WorkSchedule {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    kind: row.kind,
    cycleAnchor: row.cycleAnchor,
    days: row.days.map((day) => day.shiftId),
    weeklyMinutes: row.weeklyMinutes,
    notes: row.notes,
    isActive: row.isActive,
    // Vínculos vigentes (sem data de fim).
    employeeCount: row._count.assignments,
  };
}

/** Escalas: ciclo de dias com turno ou folga, ou carga flexível (ADR 0011). */
@Injectable()
export class WorkSchedulesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive: boolean): Promise<WorkSchedule[]> {
    const rows = await this.db.client.workSchedule.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: SCHEDULE_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toSchedule);
  }

  async get(id: string): Promise<WorkSchedule> {
    const row = await this.db.client.workSchedule.findUnique({
      where: { id },
      select: SCHEDULE_SELECT,
    });
    if (!row) throw new NotFoundException('Escala não encontrada.');
    return toSchedule(row);
  }

  async save(
    id: string | null,
    input: WorkScheduleInput,
    grant: AccessGrant,
  ): Promise<WorkSchedule> {
    assertCompanyWide(grant);
    const before = id ? await this.get(id) : null;
    const taken = await this.db.client.workSchedule.count({
      where: { name: input.name, ...(id ? { id: { not: id } } : {}) },
    });
    if (taken > 0) throw duplicated('name', 'Já existe uma escala com este nome.');

    // Escala flexível não tem dias; cíclica usa só turnos ativos da empresa.
    const days = input.kind === 'cycle' ? input.days : [];
    const shiftIds = [...new Set(days.filter((d): d is string => d !== null))];
    if (shiftIds.length > 0) {
      const found = await this.db.client.shift.count({
        where: { id: { in: shiftIds }, isActive: true },
      });
      if (found !== shiftIds.length)
        throw invalidReference('days', 'Há turnos inexistentes ou inativos no ciclo.');
    }

    const data = {
      name: input.name,
      code: input.code,
      kind: input.kind,
      cycleAnchor: input.kind === 'cycle' ? input.cycleAnchor : null,
      weeklyMinutes: input.kind === 'flexible' ? input.weeklyMinutes : null,
      notes: input.notes,
      isActive: input.isActive,
    };
    return this.db.client.$transaction(async (tx) => {
      const scheduleId = id
        ? (await tx.workSchedule.update({ where: { id }, data, select: { id: true } })).id
        : (
            await tx.workSchedule.create({
              data: { ...data, companyId: grant.companyId },
              select: { id: true },
            })
          ).id;
      await tx.workScheduleDay.deleteMany({ where: { scheduleId } });
      if (days.length > 0) {
        await tx.workScheduleDay.createMany({
          data: days.map((shiftId, dayIndex) => ({
            companyId: grant.companyId,
            scheduleId,
            dayIndex,
            shiftId,
          })),
        });
      }
      const after = toSchedule(
        await tx.workSchedule.findUniqueOrThrow({
          where: { id: scheduleId },
          select: SCHEDULE_SELECT,
        }),
      );
      await this.audit.record(
        {
          action: id ? 'work_schedule.updated' : 'work_schedule.created',
          resourceType: 'work_schedule',
          resourceId: scheduleId,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }

  async remove(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.workSchedule.findUnique({
      where: { id },
      select: { name: true, _count: { select: { assignments: true } } },
    });
    if (!row) throw new NotFoundException('Escala não encontrada.');
    // Qualquer vínculo, mesmo encerrado, é histórico usado no ponto: inativar, não excluir.
    if (row._count.assignments > 0) throw inUse('A escala tem ou já teve funcionários vinculados.');
    await this.db.client.$transaction(async (tx) => {
      await tx.workSchedule.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'work_schedule.deleted',
          resourceType: 'work_schedule',
          resourceId: id,
          metadata: { name: row.name },
        },
        tx,
      );
    });
  }
}
