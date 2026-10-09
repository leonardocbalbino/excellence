import { z } from 'zod';
import { calendarDateSchema } from '../br/fields.js';
import { benefitKindSchema } from '../benefits/benefits.schemas.js';
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
