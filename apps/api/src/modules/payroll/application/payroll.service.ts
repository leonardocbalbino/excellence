import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  BENEFIT_KIND_LABELS,
  fromCents,
  type MyPayrollPreview,
  type PayrollItem,
  payrollItemSchema,
  type PayrollPeriod,
  type PayrollPeriodDetail,
  ProblemType,
  toCents,
  type UnitMonthlySummary,
} from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { CompanyService } from '../../organization/application/company.service';
import { addDays } from '../../scheduling/domain/planner';
import { TimeTrackingService } from '../../time-tracking/application/time-tracking.service';
import { fromCalendarDate, toCalendarDate, todayIn } from '../../workforce/domain/calendar';
import { type DailyAssignment, summarizeDailyBenefits } from '../domain/daily-benefits';
import { payrollCsv } from '../domain/export-csv';
import { cutoffDate, summarizeDays } from '../domain/month-summary';
import { ratesForMonth, summarizeShiftPay } from '../domain/shift-pay';

const PERIOD_SELECT = {
  id: true,
  month: true,
  status: true,
  cutoffDate: true,
  generatedAt: true,
  generatedBy: true,
  publishedAt: true,
  closedAt: true,
  _count: { select: { items: true } },
} as const;

interface PeriodRow {
  id: string;
  month: string;
  status: PayrollPeriod['status'];
  cutoffDate: Date;
  generatedAt: Date;
  generatedBy: string | null;
  publishedAt: Date | null;
  closedAt: Date | null;
  _count: { items: number };
}

function toPeriod(row: PeriodRow): PayrollPeriod {
  return {
    id: row.id,
    month: row.month,
    status: row.status,
    cutoffDate: fromCalendarDate(row.cutoffDate),
    employees: row._count.items,
    generatedAt: row.generatedAt.toISOString(),
    automatic: row.generatedBy === null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

export function closed(): ProblemException {
  return new ProblemException({
    type: ProblemType.PayrollClosed,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail: 'Este mês já foi fechado e não pode mais ser alterado.',
  });
}

function lastDayOf(month: string): string {
  return addDays(addDays(`${month}-01`, 32).slice(0, 8) + '01', -1);
}

/**
 * Fechamento mensal (ADR 0017): consolida ponto, escala, atestados, salário do cargo e
 * benefícios de cada funcionário ativo no mês. Não calcula encargos nem impostos: o arquivo
 * exportado vai para o escritório de contabilidade.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly company: CompanyService,
    private readonly timeTracking: TimeTrackingService,
  ) {}

  async list(): Promise<PayrollPeriod[]> {
    const rows = await this.db.client.payrollPeriod.findMany({
      select: PERIOD_SELECT,
      orderBy: { month: 'desc' },
    });
    return rows.map(toPeriod);
  }

  async get(id: string): Promise<PayrollPeriodDetail> {
    const row = await this.db.client.payrollPeriod.findUnique({
      where: { id },
      select: {
        ...PERIOD_SELECT,
        items: { select: { data: true } },
      },
    });
    if (!row) throw new NotFoundException('Fechamento não encontrado.');
    const items = row.items
      .map((item) => payrollItemSchema.parse(item.data))
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name, 'pt-BR'));
    return { ...toPeriod(row), items };
  }

  /**
   * Gera o mês (ou gera de novo, enquanto não estiver fechado). `automatic`: geração da
   * virada do mês, sem pessoa responsável (`PayrollAutoGenerator`).
   */
  async generate(
    month: string,
    grant: AccessGrant,
    automatic = false,
  ): Promise<PayrollPeriodDetail> {
    assertCompanyWide(grant);
    const existing = await this.db.client.payrollPeriod.findUnique({
      where: { companyId_month: { companyId: grant.companyId, month } },
      select: { id: true, status: true },
    });
    if (existing?.status === 'closed') throw closed();

    const today = todayIn(await this.company.timezone());
    const first = `${month}-01`;
    const last = lastDayOf(month);
    if (first > today) {
      throw new ProblemException({
        type: ProblemType.Validation,
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: 'O mês ainda não começou.',
        errors: [{ path: 'month', message: 'O mês ainda não começou' }],
      });
    }
    const cutoff = cutoffDate(month, today);
    const items = await this.buildItems(month, first, last, cutoff, grant);
    const now = new Date();
    const generatedBy = automatic ? null : grant.userId;

    const periodId = await this.db.client.$transaction(async (tx) => {
      const period = existing
        ? await tx.payrollPeriod.update({
            where: { id: existing.id },
            data: { cutoffDate: toCalendarDate(cutoff), generatedAt: now, generatedBy },
            select: { id: true },
          })
        : await tx.payrollPeriod.create({
            data: {
              companyId: grant.companyId,
              month,
              cutoffDate: toCalendarDate(cutoff),
              generatedAt: now,
              generatedBy,
            },
            select: { id: true },
          });
      await tx.payrollItem.deleteMany({ where: { periodId: period.id } });
      if (items.length > 0) {
        await tx.payrollItem.createMany({
          data: items.map((item) => ({
            companyId: grant.companyId,
            periodId: period.id,
            employeeId: item.employee.id,
            data: item,
          })),
        });
      }
      await this.audit.record(
        {
          action: 'payroll.generated',
          resourceType: 'payroll_period',
          resourceId: period.id,
          metadata: { month, cutoff, employees: items.length, automatic },
          ...(automatic ? { actorUserId: null } : {}),
        },
        tx,
      );
      return period.id;
    });
    return this.get(periodId);
  }

  /** Publica a prévia: cada funcionário passa a ver a própria linha. */
  async publish(id: string, grant: AccessGrant): Promise<PayrollPeriod> {
    return this.transition(id, grant, 'published');
  }

  /** Fecha o mês: nada mais muda (trigger no banco). */
  async close(id: string, grant: AccessGrant): Promise<PayrollPeriod> {
    return this.transition(id, grant, 'closed');
  }

  async exportCsv(id: string, grant: AccessGrant): Promise<{ fileName: string; content: string }> {
    assertCompanyWide(grant);
    const period = await this.get(id);
    await this.audit.record({
      action: 'payroll.exported',
      resourceType: 'payroll_period',
      resourceId: id,
      metadata: { month: period.month, status: period.status, employees: period.items.length },
    });
    return {
      fileName: `fechamento-${period.month}.csv`,
      content: payrollCsv(period.month, period.items),
    };
  }

  /**
   * Resumo do mês de um posto (condomínio): o consolidado de cada funcionário calculado na
   * hora, mais os atestados e as trocas de escala do período (ADR 0020).
   */
  async unitSummary(
    unitId: string,
    month: string,
    grant: AccessGrant,
  ): Promise<UnitMonthlySummary> {
    assertCompanyWide(grant);
    const unit = await this.db.client.unit.findUnique({
      where: { id: unitId },
      select: { id: true, name: true },
    });
    if (!unit) throw new NotFoundException('Posto de trabalho não encontrado.');

    const first = `${month}-01`;
    const last = lastDayOf(month);
    const { cutoff, items } = await this.preview(month, grant, unitId);
    const [period, certificates, changes] = await Promise.all([
      this.db.client.payrollPeriod.findUnique({
        where: { companyId_month: { companyId: grant.companyId, month } },
        select: { id: true, status: true },
      }),
      this.db.client.medicalCertificate.findMany({
        where: {
          employee: { unitId },
          status: { not: 'cancelled' },
          startDate: { lte: toCalendarDate(last) },
          endDate: { gte: toCalendarDate(first) },
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          status: true,
          employee: { select: { id: true, name: true, socialName: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
      this.db.client.employeeScheduleAssignment.findMany({
        where: {
          employee: { unitId },
          startDate: { gte: toCalendarDate(first), lte: toCalendarDate(last) },
        },
        select: {
          startDate: true,
          schedule: { select: { name: true } },
          employee: { select: { id: true, name: true, socialName: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
    ]);
    const sum = (pick: (item: PayrollItem) => number) =>
      items.reduce((total, item) => total + pick(item), 0);
    const person = (e: { id: string; name: string; socialName: string | null }) => ({
      id: e.id,
      name: e.socialName ?? e.name,
    });

    return {
      unit,
      month,
      cutoffDate: cutoff,
      period,
      items,
      totals: {
        employees: items.length,
        shifts: sum((item) => item.shiftPay.shifts),
        shiftPay: Math.round(sum((item) => item.shiftPay.total) * 100) / 100,
        absenceDays: sum((item) => item.absenceDays),
        justifiedDays: sum((item) => item.justifiedDays),
        incompleteDays: sum((item) => item.incompleteDays),
        pendingAdjustments: sum((item) => item.pendingAdjustments),
      },
      certificates: certificates.map((row) => ({
        id: row.id,
        employee: person(row.employee),
        startDate: fromCalendarDate(row.startDate),
        endDate: fromCalendarDate(row.endDate),
        status: row.status,
      })),
      scheduleChanges: changes.map((row) => ({
        employee: person(row.employee),
        schedule: row.schedule.name,
        startDate: fromCalendarDate(row.startDate),
      })),
    };
  }

  /**
   * O consolidado do mês calculado na hora, sem gravar nada (resumo do posto, tela de
   * VA/VT). Mês que ainda não começou: não há o que contar no ponto.
   */
  async preview(
    month: string,
    grant: AccessGrant,
    unitId?: string,
  ): Promise<{ cutoff: string; items: PayrollItem[] }> {
    assertCompanyWide(grant);
    const today = todayIn(await this.company.timezone());
    const first = `${month}-01`;
    const cutoff = first > today ? addDays(first, -1) : cutoffDate(month, today);
    const items = await this.buildItems(month, first, lastDayOf(month), cutoff, grant, unitId);
    return { cutoff, items };
  }

  /** Prévias do próprio funcionário (meses publicados ou fechados). */
  async mine(userId: string): Promise<MyPayrollPreview[]> {
    const employee = await this.db.client.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) return [];
    const rows = await this.db.client.payrollItem.findMany({
      where: { employeeId: employee.id, period: { status: { in: ['published', 'closed'] } } },
      select: {
        data: true,
        period: { select: { month: true, status: true, cutoffDate: true, generatedAt: true } },
      },
      orderBy: { period: { month: 'desc' } },
    });
    return rows.map((row) => ({
      month: row.period.month,
      status: row.period.status,
      cutoffDate: fromCalendarDate(row.period.cutoffDate),
      generatedAt: row.period.generatedAt.toISOString(),
      item: payrollItemSchema.parse(row.data),
    }));
  }

  // ─── Interno ──────────────────────────────────────────────────────────────────────

  private async transition(
    id: string,
    grant: AccessGrant,
    to: 'published' | 'closed',
  ): Promise<PayrollPeriod> {
    assertCompanyWide(grant);
    const period = await this.db.client.payrollPeriod.findUnique({
      where: { id },
      select: { status: true, month: true, publishedAt: true },
    });
    if (!period) throw new NotFoundException('Fechamento não encontrado.');
    if (period.status === 'closed') throw closed();
    const now = new Date();
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.payrollPeriod.update({
        where: { id },
        data:
          to === 'published'
            ? { status: 'published', publishedAt: now, publishedBy: grant.userId }
            : {
                status: 'closed',
                closedAt: now,
                closedBy: grant.userId,
                // Fechar sem publicar antes também libera a prévia aos funcionários.
                ...(period.publishedAt ? {} : { publishedAt: now, publishedBy: grant.userId }),
              },
        select: PERIOD_SELECT,
      });
      await this.audit.record(
        {
          action: to === 'published' ? 'payroll.published' : 'payroll.closed',
          resourceType: 'payroll_period',
          resourceId: id,
          metadata: { month: period.month },
        },
        tx,
      );
      return toPeriod(row);
    });
  }

  private async buildItems(
    month: string,
    first: string,
    last: string,
    cutoff: string,
    grant: AccessGrant,
    unitId?: string,
  ): Promise<PayrollItem[]> {
    const employees = await this.db.client.employee.findMany({
      where: {
        ...(unitId ? { unitId } : {}),
        hireDate: { lte: toCalendarDate(last) },
        OR: [{ terminationDate: null }, { terminationDate: { gte: toCalendarDate(first) } }],
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        socialName: true,
        registrationNumber: true,
        cpf: true,
        hireDate: true,
        terminationDate: true,
        unitId: true,
        unit: { select: { name: true } },
        department: { select: { name: true } },
        position: { select: { name: true, baseSalaryCents: true } },
        benefits: {
          where: {
            startDate: { lte: toCalendarDate(last) },
            OR: [{ endDate: null }, { endDate: { gte: toCalendarDate(first) } }],
          },
          select: {
            companyValueCents: true,
            dailyValueCents: true,
            employeeDiscountCents: true,
            startDate: true,
            endDate: true,
            benefit: { select: { name: true, kind: true, calculation: true } },
          },
        },
      },
    });
    const adjustments = await this.db.client.benefitDayAdjustment.findMany({
      where: { month, employeeId: { in: employees.map((e) => e.id) } },
      select: {
        id: true,
        employeeId: true,
        kind: true,
        days: true,
        dailyValueCents: true,
        reason: true,
      },
    });

    // Valor por plantão vigente no mês, por posto e escala (o funcionário conta no posto atual).
    const unitIds = [...new Set(employees.map((e) => e.unitId))];
    const [rateRows, schedules] = await Promise.all([
      this.db.client.scheduleRate.findMany({
        where: { unitId: { in: unitIds }, validFrom: { lte: month } },
        select: { unitId: true, scheduleId: true, validFrom: true, amountCents: true },
      }),
      this.db.client.workSchedule.findMany({ select: { id: true, name: true } }),
    ]);
    const scheduleNames = new Map(schedules.map((s) => [s.id, s.name]));
    const rates = new Map(unitIds.map((id) => [id, ratesForMonth(rateRows, id, month)]));

    const items: PayrollItem[] = [];
    for (const employee of employees) {
      const hire = fromCalendarDate(employee.hireDate);
      const termination = fromCalendarDate(employee.terminationDate);
      const from = hire > first ? hire : first;
      const to = termination && termination < cutoff ? termination : cutoff;
      const timesheet = await this.timeTracking.timesheetFor(employee.id, month, grant);
      const totals = summarizeDays(timesheet.days, from, to);
      const shiftPay = summarizeShiftPay(
        timesheet.days,
        from,
        to,
        scheduleNames,
        rates.get(employee.unitId) ?? new Map(),
      );
      const salaryCents = employee.position?.baseSalaryCents ?? null;
      const monthly = employee.benefits.filter((b) => b.benefit.calculation === 'monthly');
      const daily = employee.benefits.flatMap(
        (b): (DailyAssignment & { discountCents: number })[] =>
          b.benefit.calculation !== 'monthly' &&
          (b.benefit.kind === 'food' || b.benefit.kind === 'transport')
            ? [
                {
                  kind: b.benefit.kind,
                  calculation: b.benefit.calculation,
                  startDate: fromCalendarDate(b.startDate),
                  endDate: fromCalendarDate(b.endDate),
                  dailyValueCents: b.dailyValueCents ?? 0,
                  discountCents: b.employeeDiscountCents,
                },
              ]
            : [],
      );
      const dailyBenefits = summarizeDailyBenefits(
        timesheet.days,
        from,
        to,
        daily,
        adjustments.flatMap((a) =>
          a.employeeId === employee.id && (a.kind === 'food' || a.kind === 'transport')
            ? [{ ...a, kind: a.kind }]
            : [],
        ),
      );
      // VA e VT entram na lista de benefícios com o valor do mês (dias × valor diário).
      const benefits = [
        ...monthly.map((b) => ({
          name: b.benefit.name,
          kind: b.benefit.kind,
          companyValue: fromCents(b.companyValueCents),
          employeeDiscount: fromCents(b.employeeDiscountCents),
        })),
        ...(['food', 'transport'] as const).flatMap((kind) => {
          const line = dailyBenefits[kind];
          if (!line) return [];
          return [
            {
              name: `${BENEFIT_KIND_LABELS[kind]} (${line.days} ${line.days === 1 ? 'dia' : 'dias'})`,
              kind,
              companyValue: line.total,
              employeeDiscount: fromCents(
                daily.filter((a) => a.kind === kind).reduce((sum, a) => sum + a.discountCents, 0),
              ),
            },
          ];
        }),
      ];
      items.push({
        employee: {
          id: employee.id,
          name: employee.socialName ?? employee.name,
          registrationNumber: employee.registrationNumber,
          cpf: employee.cpf,
        },
        unit: employee.unit.name,
        department: employee.department?.name ?? null,
        position: employee.position?.name ?? null,
        hireDate: hire,
        terminationDate: termination && termination <= last ? termination : null,
        baseSalary: salaryCents === null ? null : fromCents(salaryCents),
        ...totals,
        benefits,
        benefitsCompanyTotal: fromCents(
          benefits.reduce((sum, b) => sum + toCents(b.companyValue), 0),
        ),
        benefitsDiscountTotal: fromCents(
          employee.benefits.reduce((sum, b) => sum + b.employeeDiscountCents, 0),
        ),
        shiftPay,
        dailyBenefits,
      });
    }
    return items;
  }
}
