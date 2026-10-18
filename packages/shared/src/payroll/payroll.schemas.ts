import { z } from 'zod';
import { calendarDateSchema, moneySchema } from '../br/fields.js';
import { benefitKindSchema } from '../benefits/benefits.schemas.js';
import { medicalCertificateStatusSchema } from '../medical/medical-certificates.schemas.js';
import { monthSchema } from '../time-tracking/time-tracking.schemas.js';

const isoInstant = z.iso.datetime({ offset: true });

/**
 * Fechamento mensal (ADR 0017). O cálculo da folha (encargos, impostos, adicionais) é do
 * escritório de contabilidade; aqui o RH consolida o mês, publica a prévia para cada
 * funcionário e exporta o arquivo para a contabilidade.
 * - `draft`: só o RH vê; pode ser gerado de novo;
 * - `published`: o funcionário vê a própria prévia; ainda pode ser gerado de novo;
 * - `closed`: congelado (o banco recusa mudanças) e pronto para exportar.
 */
export const payrollStatusSchema = z.enum(['draft', 'published', 'closed']);
export type PayrollStatus = z.infer<typeof payrollStatusSchema>;

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: 'Rascunho',
  published: 'Prévia publicada',
  closed: 'Fechado',
};

/**
 * Plantões do mês por escala, com o valor por plantão vigente no posto (ADR 0020). Plantão
 * trabalhado = dia com turno previsto na escala e ao menos uma marcação. Dias com turno
 * cobertos por atestado aceito aparecem em `justifiedShifts`, sem valor: o abono depende de
 * regra legal e de convenção (P-017).
 */
export const shiftPayLineSchema = z.object({
  scheduleId: z.uuid(),
  schedule: z.string(),
  /** Valor por plantão vigente no mês; null = sem valor cadastrado no posto. */
  rate: z.number().nullable(),
  shifts: z.number().int(),
  justifiedShifts: z.number().int(),
  amount: z.number(),
});
export type ShiftPayLine = z.infer<typeof shiftPayLineSchema>;

export const shiftPaySchema = z.object({
  lines: z.array(shiftPayLineSchema),
  shifts: z.number().int(),
  total: z.number(),
});
export type ShiftPay = z.infer<typeof shiftPaySchema>;

export const payrollItemSchema = z.object({
  employee: z.object({
    id: z.uuid(),
    name: z.string(),
    registrationNumber: z.string(),
    cpf: z.string(),
  }),
  unit: z.string(),
  department: z.string().nullable(),
  position: z.string().nullable(),
  hireDate: calendarDateSchema,
  /** Desligamento dentro do mês. */
  terminationDate: calendarDateSchema.nullable(),
  /** Salário base do cargo no momento do fechamento, em reais. */
  baseSalary: z.number().nullable(),
  plannedMinutes: z.number().int(),
  workedMinutes: z.number().int(),
  /** Trabalhado menos previsto, sem regra legal (horas extras e banco são da contabilidade). */
  balanceMinutes: z.number().int(),
  /** Dias com turno, sem marcação e sem atestado aceito (até a data de corte). */
  absenceDays: z.number().int(),
  /** Dias com turno cobertos por atestado aceito. */
  justifiedDays: z.number().int(),
  /** Dias com número ímpar de marcações (falta uma). */
  incompleteDays: z.number().int(),
  /** Ajustes de ponto ainda sem decisão no mês. */
  pendingAdjustments: z.number().int(),
  benefits: z.array(
    z.object({
      name: z.string(),
      kind: benefitKindSchema,
      companyValue: z.number(),
      employeeDiscount: z.number(),
    }),
  ),
  benefitsCompanyTotal: z.number(),
  benefitsDiscountTotal: z.number(),
  /** Fechamentos gerados antes dos valores por plantão não têm o campo. */
  shiftPay: shiftPaySchema.default({ lines: [], shifts: 0, total: 0 }),
});
export type PayrollItem = z.infer<typeof payrollItemSchema>;

export const payrollPeriodSchema = z.object({
  id: z.uuid(),
  month: monthSchema,
  status: payrollStatusSchema,
  /** Faltas e marcações contadas até esta data (o fim do mês ou o dia da geração). */
  cutoffDate: calendarDateSchema,
  employees: z.number().int(),
  generatedAt: isoInstant,
  /** Gerado sozinho na virada do mês (sem pessoa responsável). */
  automatic: z.boolean(),
  publishedAt: isoInstant.nullable(),
  closedAt: isoInstant.nullable(),
});
export type PayrollPeriod = z.infer<typeof payrollPeriodSchema>;

export const payrollPeriodDetailSchema = payrollPeriodSchema.extend({
  items: z.array(payrollItemSchema),
});
export type PayrollPeriodDetail = z.infer<typeof payrollPeriodDetailSchema>;

export const payrollGenerateSchema = z.object({ month: monthSchema });
export type PayrollGenerate = z.input<typeof payrollGenerateSchema>;

/** Prévia do próprio funcionário num mês publicado ou fechado. */
export const myPayrollPreviewSchema = z.object({
  month: monthSchema,
  status: payrollStatusSchema,
  cutoffDate: calendarDateSchema,
  generatedAt: isoInstant,
  item: payrollItemSchema,
});
export type MyPayrollPreview = z.infer<typeof myPayrollPreviewSchema>;

// ─── Valor por plantão (ADR 0020) ───────────────────────────────────────────────────

/** Valor por plantão de uma escala no posto, a partir de um mês (vigência). */
export const scheduleRateSchema = z.object({
  id: z.uuid(),
  scheduleId: z.uuid(),
  scheduleName: z.string(),
  /** Primeiro mês em que o valor vale (AAAA-MM). */
  validFrom: monthSchema,
  amount: z.number(),
});
export type ScheduleRate = z.infer<typeof scheduleRateSchema>;

export const scheduleRateInputSchema = z.object({
  scheduleId: z.uuid(),
  validFrom: monthSchema,
  amount: moneySchema,
});
export type ScheduleRateInput = z.input<typeof scheduleRateInputSchema>;

// ─── Resumo mensal do posto ─────────────────────────────────────────────────────────

export const unitMonthlySummaryQuerySchema = z.object({ month: monthSchema });

/**
 * Tudo o que aconteceu no posto (condomínio) no mês: o consolidado de cada funcionário
 * (plantões, valores, faltas, atestados), os atestados do período e as trocas de escala.
 * Calculado na hora, com os dados atuais; o fechamento oficial continua em Folha.
 */
export const unitMonthlySummarySchema = z.object({
  unit: z.object({ id: z.uuid(), name: z.string() }),
  month: monthSchema,
  cutoffDate: calendarDateSchema,
  /** Fechamento do mês já gerado para a empresa, se houver. */
  period: z.object({ id: z.uuid(), status: payrollStatusSchema }).nullable(),
  items: z.array(payrollItemSchema),
  totals: z.object({
    employees: z.number().int(),
    shifts: z.number().int(),
    shiftPay: z.number(),
    absenceDays: z.number().int(),
    justifiedDays: z.number().int(),
    incompleteDays: z.number().int(),
    pendingAdjustments: z.number().int(),
  }),
  certificates: z.array(
    z.object({
      id: z.uuid(),
      employee: z.object({ id: z.uuid(), name: z.string() }),
      startDate: calendarDateSchema,
      endDate: calendarDateSchema,
      status: medicalCertificateStatusSchema,
    }),
  ),
  scheduleChanges: z.array(
    z.object({
      employee: z.object({ id: z.uuid(), name: z.string() }),
      schedule: z.string(),
      startDate: calendarDateSchema,
    }),
  ),
});
export type UnitMonthlySummary = z.infer<typeof unitMonthlySummarySchema>;
