import { Injectable, NotFoundException } from '@nestjs/common';
import {
  minutesToTime,
  type Shift,
  type shiftInputSchema,
  shiftSpanMinutes,
  timeToMinutes,
} from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { duplicated, inUse } from '../../organization/application/catalog-rules';

type ShiftInput = z.output<typeof shiftInputSchema>;

const SHIFT_SELECT = {
  id: true,
  name: true,
  code: true,
  startMinute: true,
  endMinute: true,
  breakMinutes: true,
  isActive: true,
} as const;

interface ShiftRow {
  id: string;
  name: string;
  code: string | null;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
  isActive: boolean;
}

export function toShift(row: ShiftRow): Shift {
  const start = minutesToTime(row.startMinute);
  const end = minutesToTime(row.endMinute);
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    start,
    end,
    crossesMidnight: row.endMinute <= row.startMinute,
    breakMinutes: row.breakMinutes,
    workMinutes: shiftSpanMinutes(start, end) - row.breakMinutes,
    isActive: row.isActive,
  };
}

function toData(input: ShiftInput) {
  return {
    name: input.name,
    code: input.code,
    startMinute: timeToMinutes(input.start),
    endMinute: timeToMinutes(input.end),
    breakMinutes: input.breakMinutes,
    isActive: input.isActive,
  };
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive: boolean): Promise<Shift[]> {
    const rows = await this.db.client.shift.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: SHIFT_SELECT,
      orderBy: [{ startMinute: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toShift);
  }

  async get(id: string): Promise<Shift> {
    const row = await this.db.client.shift.findUnique({ where: { id }, select: SHIFT_SELECT });
    if (!row) throw new NotFoundException('Turno não encontrado.');
    return toShift(row);
  }

  async save(id: string | null, input: ShiftInput, grant: AccessGrant): Promise<Shift> {
    assertCompanyWide(grant);
    const before = id ? await this.get(id) : null;
    const taken = await this.db.client.shift.count({
      where: { name: input.name, ...(id ? { id: { not: id } } : {}) },
    });
    if (taken > 0) throw duplicated('name', 'Já existe um turno com este nome.');
    return this.db.client.$transaction(async (tx) => {
      const row = id
        ? await tx.shift.update({ where: { id }, data: toData(input), select: SHIFT_SELECT })
        : await tx.shift.create({
            data: { ...toData(input), companyId: grant.companyId },
            select: SHIFT_SELECT,
          });
      const after = toShift(row);
      await this.audit.record(
        {
          action: id ? 'shift.updated' : 'shift.created',
          resourceType: 'shift',
          resourceId: after.id,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }

  async remove(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.shift.findUnique({
      where: { id },
      select: { name: true, _count: { select: { scheduleDays: true } } },
    });
    if (!row) throw new NotFoundException('Turno não encontrado.');
    if (row._count.scheduleDays > 0) throw inUse('O turno é usado em escalas.');
    await this.db.client.$transaction(async (tx) => {
      await tx.shift.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'shift.deleted',
          resourceType: 'shift',
          resourceId: id,
          metadata: { name: row.name },
        },
        tx,
      );
    });
  }
}
