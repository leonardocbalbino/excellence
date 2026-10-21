import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type BenefitDaysSummary,
  type benefitDaysAdjustmentInputSchema,
  type DailyBenefitLine,
  fromCents,
  optionalCents,
  type PayrollItem,
  toCents,
} from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { invalidReference } from '../../organization/application/catalog-rules';
import { closed, PayrollService } from './payroll.service';

type AdjustmentInput = z.output<typeof benefitDaysAdjustmentInputSchema>;

type Totals = BenefitDaysSummary['totals'];

function emptyTotals(): Totals {
  return { employees: 0, food: { days: 0, total: 0 }, transport: { days: 0, total: 0 }, total: 0 };
}

/** Soma em centavos para não acumular erro de ponto flutuante. */
function add(totals: Totals, item: PayrollItem): void {
  const cents = (line: DailyBenefitLine | null) => toCents(line?.total ?? 0);
  const { food, transport } = item.dailyBenefits;
  totals.employees += 1;
  totals.food.days += food?.days ?? 0;
  totals.food.total = fromCents(toCents(totals.food.total) + cents(food));
  totals.transport.days += transport?.days ?? 0;
  totals.transport.total = fromCents(toCents(totals.transport.total) + cents(transport));
  totals.total = fromCents(toCents(totals.total) + cents(food) + cents(transport));
}

/**
 * Tela de VA/VT (ADR 0021): os dois benefícios calculados por dia pelo ponto, o total geral
 * por funcionário, o resumo mensal da empresa e dos postos, e as exceções lançadas pelo RH
 * antes do fechamento. Fechado o mês, a tela mostra os valores congelados no fechamento.
 */
@Injectable()
export class BenefitDaysService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly payroll: PayrollService,
  ) {}

  async summary(month: string, grant: AccessGrant): Promise<BenefitDaysSummary> {
    assertCompanyWide(grant);
    const period = await this.db.client.payrollPeriod.findUnique({
      where: { companyId_month: { companyId: grant.companyId, month } },
      select: { id: true, status: true },
    });
    const { cutoff, items } =
      period?.status === 'closed'
        ? await this.payroll
            .get(period.id)
            .then((detail) => ({ cutoff: detail.cutoffDate, items: detail.items }))
        : await this.payroll.preview(month, grant);

    const totals = emptyTotals();
    const units = new Map<string, Totals>();
    const rows: BenefitDaysSummary['rows'] = [];
    for (const item of items) {
      const { food, transport, total } = item.dailyBenefits;
      if (!food && !transport) continue;
      rows.push({
        employee: {
          id: item.employee.id,
          name: item.employee.name,
          registrationNumber: item.employee.registrationNumber,
        },
        unit: item.unit,
        food,
        transport,
        total,
      });
      add(totals, item);
      const unit = units.get(item.unit) ?? emptyTotals();
      add(unit, item);
      units.set(item.unit, unit);
    }
    rows.sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'pt-BR'));
    return {
      month,
      cutoffDate: cutoff,
      period,
      rows,
      totals,
      units: [...units]
        .map(([unit, unitTotals]) => ({ unit, ...unitTotals }))
        .sort((a, b) => a.unit.localeCompare(b.unit, 'pt-BR')),
    };
  }

  /** Lança (ou troca) a exceção do funcionário no mês. Mês fechado não aceita. */
  async adjust(input: AdjustmentInput, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    await this.assertOpen(grant, input.month);
    const employee = await this.db.client.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true },
    });
    if (!employee) throw invalidReference('employeeId', 'Funcionário não encontrado.');

    const key = { employeeId: input.employeeId, month: input.month, kind: input.kind };
    const data = {
      days: input.days ?? null,
      dailyValueCents: optionalCents(input.dailyValue),
      reason: input.reason,
      updatedBy: grant.userId,
    };
    await this.db.client.$transaction(async (tx) => {
      const before = await tx.benefitDayAdjustment.findUnique({
        where: { employeeId_month_kind: key },
        select: { days: true, dailyValueCents: true, reason: true },
      });
      const row = await tx.benefitDayAdjustment.upsert({
        where: { employeeId_month_kind: key },
        update: data,
        create: { ...key, ...data, companyId: grant.companyId, createdBy: grant.userId },
        select: { id: true, days: true, dailyValueCents: true, reason: true },
      });
      await this.audit.record(
        {
          action: 'employee.benefit_days_adjusted',
          resourceType: 'employee',
          resourceId: input.employeeId,
          metadata: toAuditJson({ month: input.month, kind: input.kind, before, after: row }),
        },
        tx,
      );
    });
  }

  /** Desfaz a exceção: o VA ou VT volta ao valor calculado. */
  async removeAdjustment(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.benefitDayAdjustment.findUnique({
      where: { id },
      select: {
        employeeId: true,
        month: true,
        kind: true,
        days: true,
        dailyValueCents: true,
        reason: true,
      },
    });
    if (!row) throw new NotFoundException('Ajuste não encontrado.');
    await this.assertOpen(grant, row.month);
    await this.db.client.$transaction(async (tx) => {
      await tx.benefitDayAdjustment.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'employee.benefit_days_adjustment_removed',
          resourceType: 'employee',
          resourceId: row.employeeId,
          metadata: toAuditJson(row),
        },
        tx,
      );
    });
  }

  private async assertOpen(grant: AccessGrant, month: string): Promise<void> {
    const period = await this.db.client.payrollPeriod.findUnique({
      where: { companyId_month: { companyId: grant.companyId, month } },
      select: { status: true },
    });
    if (period?.status === 'closed') throw closed();
  }
}
