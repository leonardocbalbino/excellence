import { z } from 'zod';
import { calendarDateSchema } from '../br/fields.js';
import { plannedDaySchema, timeOfDaySchema } from '../scheduling/scheduling.schemas.js';

const isoInstant = z.iso.datetime({ offset: true });

// ─── Parâmetros ───────────────────────────────────────────────────────────────────

export const clockSettingsSchema = z.object({
  /** Marcação fora da cerca virtual: `allow` aceita e sinaliza; `block` recusa (P-008). */
  outsideGeofence: z.enum(['allow', 'block']),
  requireLocation: z.boolean(),
  requireSelfie: z.boolean(),
  /**
   * Minutos, após o fim de um turno que atravessa a meia-noite, em que uma marcação ainda
   * conta para o dia de trabalho anterior no espelho.
   */
  overnightGraceMinutes: z.number().int().min(0).max(720),
});
export type ClockSettings = z.infer<typeof clockSettingsSchema>;

// ─── Marcação ─────────────────────────────────────────────────────────────────────

export const clockInputSchema = z.object({
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  accuracyMeters: z.number().min(0).max(100_000).nullish(),
  /** Horário do dispositivo: só auditoria (o oficial é o do servidor). */
  deviceTimestamp: isoInstant.nullish(),
  selfieFileId: z.uuid().nullish(),
});
export type ClockInput = z.input<typeof clockInputSchema>;

export const geofenceStatusSchema = z.enum(['inside', 'outside', 'no_location', 'no_fence']);
export type GeofenceStatus = z.infer<typeof geofenceStatusSchema>;

export const timeEntryKindSchema = z.enum(['clock', 'inclusion', 'disregard']);

export const timeEntrySchema = z.object({
  id: z.uuid(),
  /** Número sequencial de registro (texto: pode passar do limite de inteiros do JSON). */
  nsr: z.string(),
  kind: timeEntryKindSchema,
  /** Horário oficial (servidor), em UTC. */
  recordedAt: isoInstant,
  deviceRecordedAt: isoInstant.nullable(),
  /** A mesma marcação no fuso da unidade, para exibição. */
  localDate: calendarDateSchema,
  localTime: timeOfDaySchema,
  timezone: z.string(),
  unit: z.object({ id: z.uuid(), name: z.string() }),
  geofenceStatus: geofenceStatusSchema,
  distanceMeters: z.number().nullable(),
  accuracyMeters: z.number().nullable(),
  hasSelfie: z.boolean(),
  referencesEntryId: z.uuid().nullable(),
  /** Marcação desconsiderada por ajuste aprovado (continua gravada). */
  disregarded: z.boolean(),
  hash: z.string(),
});
export type TimeEntry = z.infer<typeof timeEntrySchema>;

export const timeEntryListQuerySchema = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .refine((r) => r.from <= r.to, { path: ['to'], message: 'Fim antes do início' });

/** Comprovante da marcação (conteúdo; formato oficial depende da pendência P-015). */
export const clockReceiptSchema = z.object({
  entryId: z.uuid(),
  nsr: z.string(),
  company: z.object({
    name: z.string(),
    legalName: z.string().nullable(),
    cnpj: z.string().nullable(),
  }),
  unit: z.object({ name: z.string(), address: z.string().nullable() }),
  employee: z.object({ name: z.string(), cpf: z.string(), pis: z.string().nullable() }),
  recordedAt: isoInstant,
  localDate: calendarDateSchema,
  localTime: z.string(),
  timezone: z.string(),
  hash: z.string(),
});
export type ClockReceipt = z.infer<typeof clockReceiptSchema>;

// ─── Espelho ──────────────────────────────────────────────────────────────────────

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use AAAA-MM');

export const timesheetDaySchema = z.object({
  date: calendarDateSchema,
  planned: plannedDaySchema,
  /** Marcações efetivas do dia de trabalho (sem as desconsideradas), em ordem. */
  entries: z.array(
    z.object({
      id: z.uuid(),
      localTime: timeOfDaySchema,
      /** Pertence ao dia seguinte no calendário (turno que atravessa a meia-noite). */
      nextDay: z.boolean(),
      kind: timeEntryKindSchema,
      geofenceStatus: geofenceStatusSchema,
    }),
  ),
  /** Soma dos pares entrada/saída, em minutos. Sem regras legais (motor de cálculo, 1B.4). */
  workedMinutes: z.number().int(),
  /** Número ímpar de marcações: falta uma. */
  incomplete: z.boolean(),
  pendingAdjustments: z.number().int(),
  /**
   * Ausências justificadas no dia (atestado aceito). Só informativo: o efeito no cálculo
   * (abono, desconto de DSR, afastamento previdenciário) é do motor de cálculo (P-017).
   */
  justifications: z.array(
    z.object({
      type: z.enum(['medical_certificate']),
      id: z.uuid(),
      /** Afastamento por horas; null para o dia inteiro. */
      startTime: timeOfDaySchema.nullable(),
      endTime: timeOfDaySchema.nullable(),
    }),
  ),
});
export type TimesheetDay = z.infer<typeof timesheetDaySchema>;

export const timesheetSchema = z.object({
  month: monthSchema,
  employee: z.object({ id: z.uuid(), name: z.string(), registrationNumber: z.string() }),
  timezone: z.string(),
  days: z.array(timesheetDaySchema),
  totals: z.object({ workedMinutes: z.number().int(), plannedMinutes: z.number().int() }),
});
export type Timesheet = z.infer<typeof timesheetSchema>;

export const timesheetQuerySchema = z.object({ month: monthSchema });

// ─── Ajustes ──────────────────────────────────────────────────────────────────────

export const adjustmentInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('include'),
    /** Data e hora no fuso da unidade do funcionário. */
    date: calendarDateSchema,
    time: timeOfDaySchema,
    reason: z.string().trim().min(5, 'Explique o motivo').max(1000),
  }),
  z.object({
    type: z.literal('disregard'),
    targetEntryId: z.uuid(),
    reason: z.string().trim().min(5, 'Explique o motivo').max(1000),
  }),
]);
export type AdjustmentInput = z.input<typeof adjustmentInputSchema>;

export const adjustmentStatusSchema = z.enum(['pending', 'approved', 'rejected', 'cancelled']);

export const adjustmentSchema = z.object({
  id: z.uuid(),
  employee: z.object({ id: z.uuid(), name: z.string() }),
  type: z.enum(['include', 'disregard']),
  /** Inclusão: horário proposto (UTC) e o mesmo no fuso da unidade. */
  proposedAt: isoInstant.nullable(),
  proposedLocal: z.string().nullable(),
  targetEntry: z.object({ id: z.uuid(), localDate: z.string(), localTime: z.string() }).nullable(),
  reason: z.string(),
  status: adjustmentStatusSchema,
  requestedBy: z.uuid(),
  decidedBy: z.uuid().nullable(),
  decidedAt: isoInstant.nullable(),
  decisionNote: z.string().nullable(),
  createdAt: isoInstant,
});
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const adjustmentListQuerySchema = z.object({
  status: adjustmentStatusSchema.optional(),
});

export const adjustmentDecisionSchema = z.object({
  note: z.string().trim().max(1000).nullish(),
});
export type AdjustmentDecision = z.input<typeof adjustmentDecisionSchema>;

/** Resultado da conferência da cadeia de hashes das marcações de um funcionário. */
export const chainVerificationSchema = z.object({
  valid: z.boolean(),
  /** Primeira marcação inconsistente (null quando íntegra). */
  brokenAtId: z.uuid().nullable(),
  entries: z.number().int(),
});
export type ChainVerification = z.infer<typeof chainVerificationSchema>;
