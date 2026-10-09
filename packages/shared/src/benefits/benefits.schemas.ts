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

export const benefitInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(80),
  kind: benefitKindSchema,
  provider: optionalText(120),
  description: optionalText(2000),
  /** Como usar: cartão, aplicativo, rede credenciada, contato… */
  howToUse: optionalText(2000),
  /** Valores sugeridos ao atribuir (podem mudar por funcionário), em reais por mês. */
  defaultCompanyValue: moneySchema.nullish(),
  defaultEmployeeDiscount: moneySchema.nullish(),
  isActive: z.boolean().default(true),
});
export type BenefitInput = z.input<typeof benefitInputSchema>;

export const benefitSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: benefitKindSchema,
  provider: z.string().nullable(),
  description: z.string().nullable(),
  howToUse: z.string().nullable(),
  defaultCompanyValue: z.number().nullable(),
  defaultEmployeeDiscount: z.number().nullable(),
  isActive: z.boolean(),
});
export type Benefit = z.infer<typeof benefitSchema>;

// ─── Benefício do funcionário ─────────────────────────────────────────────────────

export const employeeBenefitInputSchema = z
  .object({
    benefitId: z.uuid(),
    /** Valor mensal pago pela empresa, em reais. */
    companyValue: moneySchema,
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
  benefit: namedRef.extend({ kind: benefitKindSchema }),
  companyValue: z.number(),
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
  benefit: benefitSchema.omit({ defaultCompanyValue: true, defaultEmployeeDiscount: true }),
  companyValue: z.number(),
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
