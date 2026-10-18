import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  fromCents,
  ProblemType,
  type ScheduleRate,
  type scheduleRateInputSchema,
  toCents,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { invalidReference } from '../../organization/application/catalog-rules';
import { usableIn } from '../../scheduling/domain/unit-owner';

type RateInput = z.output<typeof scheduleRateInputSchema>;

const RATE_SELECT = {
  id: true,
  scheduleId: true,
  validFrom: true,
  amountCents: true,
  schedule: { select: { name: true } },
} as const;

function toRate(row: {
  id: string;
  scheduleId: string;
  validFrom: string;
  amountCents: number;
  schedule: { name: string };
}): ScheduleRate {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    scheduleName: row.schedule.name,
    validFrom: row.validFrom,
    amount: fromCents(row.amountCents),
  };
}

/**
 * Valor por plantão de cada escala no posto (condomínio), com vigência mensal (ADR 0020).
 * Cadastrar um valor "a partir de novembro" é o reajuste: ele passa a valer sozinho na
 * virada do mês, e os meses anteriores continuam com o valor antigo. Meses já fechados na
 * folha não aceitam mudança de valor.
 */
@Injectable()
export class ScheduleRatesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(unitId: string, grant: AccessGrant): Promise<ScheduleRate[]> {
    assertCompanyWide(grant);
    await this.unit(unitId);
    const rows = await this.db.client.scheduleRate.findMany({
      where: { unitId },
      select: RATE_SELECT,
      orderBy: [{ schedule: { name: 'asc' } }, { validFrom: 'desc' }],
    });
    return rows.map(toRate);
  }

  /** Cria o valor da vigência, ou troca o valor se a mesma vigência já existe. */
  async save(unitId: string, input: RateInput, grant: AccessGrant): Promise<ScheduleRate> {
    assertCompanyWide(grant);
    await this.unit(unitId);
    const schedule = await this.db.client.workSchedule.findUnique({
      where: { id: input.scheduleId },
      select: { unitId: true },
    });
    if (!schedule || !usableIn(schedule.unitId, unitId)) {
      throw invalidReference('scheduleId', 'Escala não encontrada neste posto.');
    }
    await this.assertOpen(input.validFrom);

    const amountCents = toCents(input.amount);
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.scheduleRate.upsert({
        where: {
          unitId_scheduleId_validFrom: {
            unitId,
            scheduleId: input.scheduleId,
            validFrom: input.validFrom,
          },
        },
        create: {
          companyId: grant.companyId,
          unitId,
          scheduleId: input.scheduleId,
          validFrom: input.validFrom,
          amountCents,
          createdBy: grant.userId,
        },
        update: { amountCents },
        select: RATE_SELECT,
      });
      const rate = toRate(row);
      await this.audit.record(
        {
          action: 'schedule_rate.saved',
          resourceType: 'unit',
          resourceId: unitId,
          metadata: { ...rate },
        },
        tx,
      );
      return rate;
    });
  }

  async remove(unitId: string, id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.scheduleRate.findFirst({
      where: { id, unitId },
      select: RATE_SELECT,
    });
    if (!row) throw new NotFoundException('Valor não encontrado.');
    await this.assertOpen(row.validFrom);
    await this.db.client.$transaction(async (tx) => {
      await tx.scheduleRate.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'schedule_rate.deleted',
          resourceType: 'unit',
          resourceId: unitId,
          metadata: { ...toRate(row) },
        },
        tx,
      );
    });
  }

  private async unit(unitId: string): Promise<void> {
    const found = await this.db.client.unit.count({ where: { id: unitId } });
    if (found === 0) throw new NotFoundException('Posto de trabalho não encontrado.');
  }

  /** Valor que começa num mês já fechado mudaria um fechamento definitivo. */
  private async assertOpen(validFrom: string): Promise<void> {
    const closed = await this.db.client.payrollPeriod.findFirst({
      where: { status: 'closed', month: { gte: validFrom } },
      select: { month: true },
      orderBy: { month: 'desc' },
    });
    if (closed) {
      throw new ProblemException({
        type: ProblemType.PayrollClosed,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: `O mês ${closed.month} já foi fechado. Cadastre o valor a partir de um mês ainda aberto.`,
        errors: [{ path: 'validFrom', message: 'Mês já fechado na folha' }],
      });
    }
  }
}
