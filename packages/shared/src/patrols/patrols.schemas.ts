import { z } from 'zod';
import { calendarDateSchema, optionalText } from '../br/fields.js';
import { timeOfDaySchema } from '../scheduling/scheduling.schemas.js';
import { geofenceStatusSchema } from '../time-tracking/time-tracking.schemas.js';

const isoInstant = z.iso.datetime({ offset: true });
const namedRef = z.object({ id: z.uuid(), name: z.string() });

const unique = <T extends z.ZodType>(item: T, message: string) =>
  z.array(item).refine((values) => new Set(values).size === values.length, message);

/**
 * Conteúdo do QR code de um ponto: `EXR1.<id do ponto>.<token>`. O token é aleatório (128
 * bits), guardado no banco e trocado ao gerar um novo QR; o código antigo deixa de valer.
 */
export const PATROL_CODE_PREFIX = 'EXR1';

export function parsePatrolCode(code: string): { pointId: string; token: string } | null {
  const [prefix, pointId, token, ...rest] = code.trim().split('.');
  if (prefix !== PATROL_CODE_PREFIX || !pointId || !token || rest.length > 0) return null;
  if (!z.uuid().safeParse(pointId).success) return null;
  return { pointId, token };
}

// ─── Pontos ───────────────────────────────────────────────────────────────────────

export const patrolPointInputSchema = z
  .object({
    unitId: z.uuid(),
    name: z.string().trim().min(2, 'Informe o nome').max(80),
    description: optionalText(500),
    /** Localização do ponto, para conferir onde o check-in foi feito (opcional). */
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    radiusMeters: z.number().int().min(5).max(2000).nullish(),
    isActive: z.boolean().default(true),
  })
  .superRefine((point, ctx) => {
    const hasLat = point.latitude !== null && point.latitude !== undefined;
    const hasLng = point.longitude !== null && point.longitude !== undefined;
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: 'custom',
        path: [hasLat ? 'longitude' : 'latitude'],
        message: 'Informe latitude e longitude',
      });
    }
    if (point.radiusMeters && !hasLat) {
      ctx.addIssue({
        code: 'custom',
        path: ['radiusMeters'],
        message: 'O raio precisa da localização do ponto',
      });
    }
  });
export type PatrolPointInput = z.input<typeof patrolPointInputSchema>;

export const patrolPointSchema = z.object({
  id: z.uuid(),
  unit: namedRef,
  name: z.string(),
  description: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  radiusMeters: z.number().int().nullable(),
  isActive: z.boolean(),
  /** Conteúdo do QR para impressão (só na gestão). */
  code: z.string(),
  /** Quantas vezes o QR já foi gerado (1 = original). */
  codeVersion: z.number().int(),
});
export type PatrolPoint = z.infer<typeof patrolPointSchema>;

// ─── Rotas ────────────────────────────────────────────────────────────────────────

/** Dias da semana: 0 = domingo … 6 = sábado. */
export const weekdaySchema = z.number().int().min(0).max(6);

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export const patrolRouteInputSchema = z
  .object({
    unitId: z.uuid(),
    name: z.string().trim().min(2, 'Informe o nome').max(80),
    description: optionalText(500),
    /** Tempo previsto para percorrer a rota; passou disso, a ronda fica atrasada. */
    expectedMinutes: z.number().int().min(5).max(720),
    /** Exige os pontos na ordem cadastrada. Sem isso, fora de ordem é aceito e sinalizado. */
    enforceOrder: z.boolean().default(false),
    pointIds: unique(z.uuid(), 'Ponto repetido na rota')
      .min(1, 'Inclua ao menos um ponto')
      .max(100),
    /** Horários de início previstos (fuso da unidade). Vazio: ronda sem horário fixo. */
    startTimes: unique(timeOfDaySchema, 'Horário repetido').max(48).default([]),
    weekdays: unique(weekdaySchema, 'Dia repetido').default([]),
    /** Funcionários que fazem esta rota. */
    assigneeIds: unique(z.uuid(), 'Funcionário repetido').max(200).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((route, ctx) => {
    if (route.startTimes.length > 0 && route.weekdays.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['weekdays'],
        message: 'Escolha os dias em que os horários valem',
      });
    }
  });
export type PatrolRouteInput = z.input<typeof patrolRouteInputSchema>;

export const patrolRouteSchema = z.object({
  id: z.uuid(),
  unit: namedRef,
  name: z.string(),
  description: z.string().nullable(),
  expectedMinutes: z.number().int(),
  enforceOrder: z.boolean(),
  points: z.array(namedRef),
  startTimes: z.array(timeOfDaySchema),
  weekdays: z.array(weekdaySchema),
  assignees: z.array(namedRef),
  isActive: z.boolean(),
});
export type PatrolRoute = z.infer<typeof patrolRouteSchema>;

// ─── Execução ─────────────────────────────────────────────────────────────────────

export const patrolRunStatusSchema = z.enum(['in_progress', 'completed', 'incomplete']);
export type PatrolRunStatus = z.infer<typeof patrolRunStatusSchema>;

export const patrolCheckinSchema = z.object({
  id: z.uuid(),
  /** Horário oficial (servidor). */
  recordedAt: isoInstant,
  localTime: timeOfDaySchema,
  geofenceStatus: geofenceStatusSchema,
  distanceMeters: z.number().nullable(),
  /** Lido antes de um ponto anterior da rota. */
  outOfOrder: z.boolean(),
  /** Lido sem conexão no app e enviado depois (ADR 0019). */
  offline: z.boolean().default(false),
});
export type PatrolCheckin = z.infer<typeof patrolCheckinSchema>;

export const patrolRunSchema = z.object({
  id: z.uuid(),
  route: namedRef,
  unit: namedRef,
  employee: namedRef,
  timezone: z.string(),
  /** Horário previsto que a ronda cumpre (null: iniciada fora dos horários da rota). */
  scheduledFor: isoInstant.nullable(),
  startedAt: isoInstant,
  expectedEndAt: isoInstant,
  finishedAt: isoInstant.nullable(),
  status: patrolRunStatusSchema,
  finishNote: z.string().nullable(),
  enforceOrder: z.boolean(),
  /** Pontos como estavam na rota ao iniciar, em ordem, com o check-in de cada um. */
  points: z.array(
    z.object({ id: z.uuid(), name: z.string(), checkin: patrolCheckinSchema.nullable() }),
  ),
  checked: z.number().int(),
  total: z.number().int(),
  /** Minutos além do previsto (em andamento: até agora; encerrada: no fim). 0 = no prazo. */
  lateMinutes: z.number().int(),
  nextPoint: namedRef.nullable(),
});
export type PatrolRun = z.infer<typeof patrolRunSchema>;

export const patrolRunStartSchema = z.object({ routeId: z.uuid() });
export type PatrolRunStart = z.input<typeof patrolRunStartSchema>;

export const patrolCheckinInputSchema = z.object({
  /** Conteúdo lido do QR code (ou digitado, se a câmera falhar). */
  code: z.string().trim().min(1, 'Leia o QR code').max(200),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  accuracyMeters: z.number().min(0).max(100_000).nullish(),
  /** Horário do dispositivo: só auditoria (o oficial é o do servidor). */
  deviceTimestamp: isoInstant.nullish(),
  /**
   * Feito sem conexão no app: momento do registro no aparelho. Aceito até 72 h para trás e
   * nunca no futuro; fica sinalizado como offline (ADR 0019, pendência P-026).
   */
  offlineRecordedAt: isoInstant.nullish(),
});
export type PatrolCheckinInput = z.input<typeof patrolCheckinInputSchema>;

export const patrolRunFinishSchema = z.object({
  /** Obrigatória quando faltam pontos: por que a ronda terminou incompleta. */
  note: optionalText(1000),
});
export type PatrolRunFinish = z.input<typeof patrolRunFinishSchema>;

/**
 * Situação de um horário previsto de ronda:
 * - `upcoming`: ainda não começou;
 * - `in_progress`: há ronda em andamento para ele;
 * - `done`: ronda encerrada (completa ou não);
 * - `missed`: passou o horário mais o tempo previsto e ninguém iniciou.
 */
export const patrolSlotStatusSchema = z.enum(['upcoming', 'in_progress', 'done', 'missed']);
export type PatrolSlotStatus = z.infer<typeof patrolSlotStatusSchema>;

export const patrolSlotSchema = z.object({
  route: namedRef,
  unit: namedRef,
  at: isoInstant,
  localTime: timeOfDaySchema,
  status: patrolSlotStatusSchema,
  runId: z.uuid().nullable(),
});
export type PatrolSlot = z.infer<typeof patrolSlotSchema>;

/** Rotas do próprio funcionário, com os horários de hoje e a ronda em andamento. */
export const myPatrolsSchema = z.object({
  routes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      unit: namedRef,
      expectedMinutes: z.number().int(),
      pointsCount: z.number().int(),
      slots: z.array(patrolSlotSchema),
    }),
  ),
  current: patrolRunSchema.nullable(),
});
export type MyPatrols = z.infer<typeof myPatrolsSchema>;

export const patrolBoardQuerySchema = z.object({ date: calendarDateSchema });

/** Quadro do dia na gestão: rondas feitas ou em andamento e os horários previstos. */
export const patrolBoardSchema = z.object({
  date: calendarDateSchema,
  runs: z.array(patrolRunSchema),
  slots: z.array(patrolSlotSchema),
});
export type PatrolBoard = z.infer<typeof patrolBoardSchema>;
