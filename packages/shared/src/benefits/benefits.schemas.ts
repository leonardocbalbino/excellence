import { z } from 'zod';
import { calendarDateSchema, moneySchema, optionalText } from '../br/fields.js';

const namedRef = z.object({ id: z.uuid(), name: z.string() });

// ─── Catálogo de benefícios ───────────────────────────────────────────────────────

export const benefitKindSchema = z.enum([
  'transport',
  'meal',
  'food',
  'health',
  'dental',
  'life_insurance',
  'other',
]);
export type BenefitKind = z.infer<typeof benefitKindSchema>;

export const BENEFIT_KIND_LABELS: Record<BenefitKind, string> = {
  transport: 'Vale-transporte',
  meal: 'Vale-refeição',
  food: 'Vale-alimentação',
  health: 'Plano de saúde',
  dental: 'Plano odontológico',
  life_insurance: 'Seguro de vida',
  other: 'Outro',
};

/**
 * Regra de cálculo do benefício (ADR 0021):
 * - `monthly`: valor fixo por mês, informado na atribuição;
 * - `per_worked_day`: dias com marcação no ponto × valor diário;
 * - `per_worked_or_justified_day`: idem, contando também os dias de turno cobertos por
 *   atestado aceito.
 * Só VA (`food`) e VT (`transport`) podem ser calculados por dia.
 */
export const benefitCalculationSchema = z.enum([
  'monthly',
  'per_worked_day',
  'per_worked_or_justified_day',
]);
export type BenefitCalculation = z.infer<typeof benefitCalculationSchema>;

export const BENEFIT_CALCULATION_LABELS: Record<BenefitCalculation, string> = {
  monthly: 'Valor fixo por mês',
  per_worked_day: 'Por dia trabalhado (ponto)',
  per_worked_or_justified_day: 'Por dia trabalhado ou com atestado',
};

/** Tipos de benefício que podem ser calculados por dia: VA e VT. */
export const dailyBenefitKindSchema = z.enum(['food', 'transport']);
export type DailyBenefitKind = z.infer<typeof dailyBenefitKindSchema>;

export const DAILY_BENEFIT_LABELS: Record<DailyBenefitKind, string> = {
  food: 'VA – Vale-alimentação',
  transport: 'VT – Vale-transporte',
};

export function isDailyCalculation(calculation: BenefitCalculation): boolean {
  return calculation !== 'monthly';
}

export const benefitInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome').max(80),
    kind: benefitKindSchema,
    provider: optionalText(120),
    description: optionalText(2000),
    /** Como usar: cartão, aplicativo, rede credenciada, contato… */
    howToUse: optionalText(2000),
    calculation: benefitCalculationSchema.default('monthly'),
    /** Valores sugeridos ao atribuir (podem mudar por funcionário), em reais por mês. */
    defaultCompanyValue: moneySchema.nullish(),
    defaultEmployeeDiscount: moneySchema.nullish(),
    /** Valor diário sugerido (cálculo por dia), em reais. */
    defaultDailyValue: moneySchema.nullish(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.calculation === 'monthly' || dailyBenefitKindSchema.safeParse(v.kind).success, {
    path: ['calculation'],
    message: 'Só VA e VT podem ser calculados por dia',
  });
export type BenefitInput = z.input<typeof benefitInputSchema>;

export const benefitSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: benefitKindSchema,
  provider: z.string().nullable(),
  description: z.string().nullable(),
  howToUse: z.string().nullable(),
  calculation: benefitCalculationSchema,
  defaultCompanyValue: z.number().nullable(),
  defaultEmployeeDiscount: z.number().nullable(),
  defaultDailyValue: z.number().nullable(),
  isActive: z.boolean(),
});
export type Benefit = z.infer<typeof benefitSchema>;

// ─── Benefício do funcionário ─────────────────────────────────────────────────────

export const employeeBenefitInputSchema = z
  .object({
    benefitId: z.uuid(),
    /** Valor mensal pago pela empresa, em reais (benefício de valor fixo). */
    companyValue: moneySchema.default(0),
    /**
     * Valor por dia, em reais (benefício calculado por dia). Vazio: usa o valor diário
     * sugerido no catálogo.
     */
    dailyValue: moneySchema.nullish(),
    /** Desconto mensal na folha do funcionário, em reais. */
    employeeDiscount: moneySchema.default(0),
    startDate: calendarDateSchema,
    /** Último dia do benefício; vazio = vigente. */
    endDate: calendarDateSchema.nullish(),
    notes: optionalText(500),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Fim antes do início',
  });
export type EmployeeBenefitInput = z.input<typeof employeeBenefitInputSchema>;

export const employeeBenefitSchema = z.object({
  id: z.uuid(),
  employee: namedRef,
  benefit: namedRef.extend({ kind: benefitKindSchema, calculation: benefitCalculationSchema }),
  companyValue: z.number(),
  /** Valor por dia (benefício calculado por dia); null nos de valor fixo. */
  dailyValue: z.number().nullable(),
  employeeDiscount: z.number(),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema.nullable(),
  notes: z.string().nullable(),
  /** Vigente hoje. */
  active: z.boolean(),
});
export type EmployeeBenefit = z.infer<typeof employeeBenefitSchema>;

/** Benefício vigente do próprio funcionário, com as informações do catálogo. */
export const myBenefitSchema = z.object({
  id: z.uuid(),
  benefit: benefitSchema.omit({
    defaultCompanyValue: true,
    defaultEmployeeDiscount: true,
    defaultDailyValue: true,
  }),
  companyValue: z.number(),
  dailyValue: z.number().nullable(),
  employeeDiscount: z.number(),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema.nullable(),
});
export type MyBenefit = z.infer<typeof myBenefitSchema>;

// ─── Links úteis ──────────────────────────────────────────────────────────────────

export const usefulLinkInputSchema = z.object({
  /** Título mostrado ao funcionário. */
  name: z.string().trim().min(2, 'Informe o título').max(80),
  url: z.url({ protocol: /^https?$/, message: 'Use um endereço http(s) completo' }).max(500),
  description: optionalText(300),
  /** Agrupa os links na tela (ex.: "Governo", "Benefícios"). */
  category: optionalText(40),
  /** Ordem de exibição (menor primeiro). */
  position: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});
export type UsefulLinkInput = z.input<typeof usefulLinkInputSchema>;

export const usefulLinkSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  url: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  position: z.number().int(),
  isActive: z.boolean(),
});
export type UsefulLink = z.infer<typeof usefulLinkSchema>;
