import { z } from 'zod';
import { calendarDateSchema } from '../br/fields.js';
import { downloadLinkSchema } from '../files/files.schemas.js';
import { timeOfDaySchema, timeToMinutes } from '../scheduling/scheduling.schemas.js';

const isoInstant = z.iso.datetime({ offset: true });

/**
 * Código CID como escrito no atestado. Aceita CID-10 (ex.: J11, J11.1) e CID-11 (ex.: 1A00);
 * só o formato é conferido, não a existência do código.
 */
export const cidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,4}(\.[A-Z0-9]{1,4})?$/, 'Código CID inválido');

export const medicalCertificateStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'cancelled',
]);
export type MedicalCertificateStatus = z.infer<typeof medicalCertificateStatusSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === '' ? null : (value ?? null)));

export const medicalCertificateInputSchema = z
  .object({
    /** Arquivo já enviado e confirmado com a finalidade `medical_certificate`. */
    fileId: z.uuid(),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    /** Horário do afastamento parcial (declaração de horas), só para um único dia. */
    startTime: timeOfDaySchema.nullish(),
    endTime: timeOfDaySchema.nullish(),
    issuerName: optionalText(200),
    issuerRegistry: optionalText(50),
    /** Opcional: o funcionário não é obrigado a informar o diagnóstico. */
    cid: cidSchema.nullish().or(z.literal('').transform(() => null)),
    notes: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Fim antes do início' });
    }
    const partial = Boolean(value.startTime) || Boolean(value.endTime);
    if (!partial) return;
    if (!value.startTime || !value.endTime) {
      ctx.addIssue({
        code: 'custom',
        path: [value.startTime ? 'endTime' : 'startTime'],
        message: 'Informe o início e o fim',
      });
      return;
    }
    if (value.startDate !== value.endDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'Afastamento por horas vale para um único dia',
      });
    }
    if (timeToMinutes(value.endTime) <= timeToMinutes(value.startTime)) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Fim antes do início' });
    }
  });
export type MedicalCertificateInput = z.input<typeof medicalCertificateInputSchema>;

/** Atestado sem dados sensíveis (sem CID). O documento sai por rota própria. */
export const medicalCertificateSchema = z.object({
  id: z.uuid(),
  employee: z.object({ id: z.uuid(), name: z.string(), registrationNumber: z.string() }),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
  startTime: timeOfDaySchema.nullable(),
  endTime: timeOfDaySchema.nullable(),
  /** Dias corridos do período (1 para afastamento por horas). */
  days: z.number().int(),
  issuerName: z.string().nullable(),
  issuerRegistry: z.string().nullable(),
  /** Indica se há CID registrado, sem revelá-lo. */
  hasCid: z.boolean(),
  notes: z.string().nullable(),
  file: z.object({ name: z.string(), contentType: z.string() }),
  status: medicalCertificateStatusSchema,
  submittedBy: z.uuid(),
  reviewedBy: z.uuid().nullable(),
  reviewedAt: isoInstant.nullable(),
  reviewNote: z.string().nullable(),
  createdAt: isoInstant,
});
export type MedicalCertificate = z.infer<typeof medicalCertificateSchema>;

/** Dados sensíveis: leitura só com permissão própria e sempre auditada (regra 7). */
export const medicalCertificateSensitiveSchema = z.object({
  id: z.uuid(),
  cid: z.string().nullable(),
  /** Link para baixar o arquivo. */
  document: downloadLinkSchema,
  /** Link para ver no navegador (null quando o tipo não abre sozinho, ex.: HEIC). */
  preview: downloadLinkSchema.nullable(),
  contentType: z.string(),
});
export type MedicalCertificateSensitive = z.infer<typeof medicalCertificateSensitiveSchema>;

export const medicalCertificateListQuerySchema = z.object({
  status: medicalCertificateStatusSchema.optional(),
  employeeId: z.uuid().optional(),
  /** Atestados que tocam o intervalo informado. */
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
});
export type MedicalCertificateListQuery = z.input<typeof medicalCertificateListQuerySchema>;

export const medicalCertificateReviewSchema = z.object({
  note: z.string().trim().max(1000).nullish(),
});
export type MedicalCertificateReview = z.input<typeof medicalCertificateReviewSchema>;
