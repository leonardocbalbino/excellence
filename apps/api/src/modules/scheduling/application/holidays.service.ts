import { Injectable, NotFoundException } from '@nestjs/common';
import type { Holiday, holidayInputSchema } from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { invalidReference } from '../../organization/application/catalog-rules';
import { fromCalendarDate, toCalendarDate } from '../../workforce/domain/calendar';

type HolidayInput = z.output<typeof holidayInputSchema>;

const HOLIDAY_SELECT = {
  id: true,
  date: true,
  name: true,
  scope: true,
  state: true,
  city: true,
  unitId: true,
} as const;

function toHoliday(row: {
  id: string;
  date: Date;
  name: string;
  scope: Holiday['scope'];
  state: string | null;
  city: string | null;
  unitId: string | null;
}): Holiday {
  return { ...row, date: fromCalendarDate(row.date) };
}

@Injectable()
export class HolidaysService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(year: number): Promise<Holiday[]> {
    const rows = await this.db.client.holiday.findMany({
      where: {
        date: { gte: toCalendarDate(`${year}-01-01`), lte: toCalendarDate(`${year}-12-31`) },
      },
      select: HOLIDAY_SELECT,
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toHoliday);
  }

  async get(id: string): Promise<Holiday> {
    const row = await this.db.client.holiday.findUnique({ where: { id }, select: HOLIDAY_SELECT });
    if (!row) throw new NotFoundException('Feriado não encontrado.');
    return toHoliday(row);
  }

  async save(id: string | null, input: HolidayInput, grant: AccessGrant): Promise<Holiday> {
    assertCompanyWide(grant);
    const before = id ? await this.get(id) : null;
    if (input.unitId && (await this.db.client.unit.count({ where: { id: input.unitId } })) === 0) {
      throw invalidReference('unitId', 'Unidade não encontrada.');
    }
    // Só guarda os campos da abrangência escolhida (o banco também confere).
    const data = {
      date: toCalendarDate(input.date),
      name: input.name,
      scope: input.scope,
      state: input.scope === 'state' || input.scope === 'city' ? input.state : null,
      city: input.scope === 'city' ? input.city : null,
      unitId: input.scope === 'unit' ? input.unitId : null,
    };
    return this.db.client.$transaction(async (tx) => {
      const row = id
        ? await tx.holiday.update({ where: { id }, data, select: HOLIDAY_SELECT })
        : await tx.holiday.create({
            data: { ...data, companyId: grant.companyId },
            select: HOLIDAY_SELECT,
          });
      const after = toHoliday(row);
      await this.audit.record(
        {
          action: id ? 'holiday.updated' : 'holiday.created',
          resourceType: 'holiday',
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
    const holiday = await this.get(id);
    await this.db.client.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'holiday.deleted',
          resourceType: 'holiday',
          resourceId: id,
          metadata: toAuditJson(holiday),
        },
        tx,
      );
    });
  }
}
