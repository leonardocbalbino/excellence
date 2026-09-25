import { z } from 'zod';
import {
  cnpjSchema,
  optionalText,
  postalCodeSchema,
  stateSchema,
  timezoneSchema,
} from '../br/fields.js';

// ─── Empresa ──────────────────────────────────────────────────────────────────────

export const companySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  legalName: z.string().nullable(),
  cnpj: z.string().nullable(),
  timezone: z.string(),
  /** Perfil atribuído às contas de acesso criadas para funcionários. */
  defaultEmployeeRoleId: z.uuid().nullable(),
});
export type Company = z.infer<typeof companySchema>;

export const companyInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: optionalText(200),
  cnpj: cnpjSchema.nullish().transform((v) => v ?? null),
  timezone: timezoneSchema,
  defaultEmployeeRoleId: z.uuid().nullable(),
});
export type CompanyInput = z.input<typeof companyInputSchema>;

// ─── Unidades ─────────────────────────────────────────────────────────────────────

export const GEOFENCE_RADIUS_LIMITS = { min: 10, max: 5000 } as const;

const coordinates = {
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
};

export const unitSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  cnpj: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  ...coordinates,
  /** Raio da cerca virtual em metros; null = sem cerca. */
  geofenceRadiusMeters: z.number().int().nullable(),
  /** Fuso da unidade; null = fuso da empresa. */
  timezone: z.string().nullable(),
  isActive: z.boolean(),
});
export type Unit = z.infer<typeof unitSchema>;

export const unitInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    code: optionalText(30),
    cnpj: cnpjSchema.nullish().transform((v) => v ?? null),
    street: optionalText(200),
    number: optionalText(20),
    complement: optionalText(100),
    district: optionalText(100),
    city: optionalText(100),
    state: stateSchema.nullish().transform((v) => v ?? null),
    postalCode: postalCodeSchema.nullish().transform((v) => v ?? null),
    ...coordinates,
    geofenceRadiusMeters: z
      .number()
      .int()
      .min(GEOFENCE_RADIUS_LIMITS.min)
      .max(GEOFENCE_RADIUS_LIMITS.max)
      .nullable(),
    timezone: timezoneSchema.nullable(),
    isActive: z.boolean().default(true),
  })
  .superRefine((unit, ctx) => {
    if ((unit.latitude === null) !== (unit.longitude === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['longitude'],
        message: 'Informe latitude e longitude juntas',
      });
    }
    if (unit.geofenceRadiusMeters !== null && unit.latitude === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['geofenceRadiusMeters'],
        message: 'A cerca virtual exige as coordenadas da unidade',
      });
    }
  });
export type UnitInput = z.input<typeof unitInputSchema>;

// ─── Departamentos, cargos e sindicatos ───────────────────────────────────────────

export const departmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  /** Unidade a que o departamento pertence; null = vale para a empresa toda. */
  unitId: z.uuid().nullable(),
  isActive: z.boolean(),
});
export type Department = z.infer<typeof departmentSchema>;

export const departmentInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: optionalText(30),
  unitId: z.uuid().nullable(),
  isActive: z.boolean().default(true),
});
export type DepartmentInput = z.input<typeof departmentInputSchema>;

export const positionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Código CBO (Classificação Brasileira de Ocupações), 6 dígitos. */
  cbo: z.string().nullable(),
  isActive: z.boolean(),
});
export type Position = z.infer<typeof positionSchema>;

export const positionInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  cbo: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'CBO deve ter 6 dígitos'))
    .nullish()
    .transform((v) => v ?? null),
  isActive: z.boolean().default(true),
});
export type PositionInput = z.input<typeof positionInputSchema>;

export const laborUnionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  cnpj: z.string().nullable(),
  /** Mês da data-base da categoria (1 a 12). */
  baseMonth: z.number().int().nullable(),
  isActive: z.boolean(),
});
export type LaborUnion = z.infer<typeof laborUnionSchema>;

export const laborUnionInputSchema = z.object({
  name: z.string().trim().min(2).max(200),
  cnpj: cnpjSchema.nullish().transform((v) => v ?? null),
  baseMonth: z.number().int().min(1).max(12).nullable(),
  isActive: z.boolean().default(true),
});
export type LaborUnionInput = z.input<typeof laborUnionInputSchema>;

export const includeInactiveQuerySchema = z.object({
  includeInactive: z.stringbool().default(false),
});
