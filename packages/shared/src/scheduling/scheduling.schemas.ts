import { z } from 'zod';
import { calendarDateSchema, optionalText, stateSchema } from '../br/fields.js';

// ─── Horários ─────────────────────────────────────────────────────────────────────

/** Horário do dia no formato HH:MM (00:00 a 23:59). */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');

export function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/** Duração de um turno em minutos; fim menor ou igual ao início = termina no dia seguinte. */
export function shiftSpanMinutes(start: string, end: string): number {
  const span = timeToMinutes(end) - timeToMinutes(start);
  return span > 0 ? span : span + 1440;
}

// ─── Turnos ───────────────────────────────────────────────────────────────────────

export const shiftSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  start: timeOfDaySchema,
  end: timeOfDaySchema,
  /** Termina no dia seguinte ao início (ex.: 19:00 às 07:00). */
  crossesMidnight: z.boolean(),
  /** Minutos de intervalo dentro do turno (não trabalhados). */
  breakMinutes: z.number().int(),
  /** Minutos trabalhados previstos: duração menos intervalo. */
  workMinutes: z.number().int(),
  isActive: z.boolean(),
});
export type Shift = z.infer<typeof shiftSchema>;

/**
 * Cadastro de turno. Só há validação estrutural: limites legais (intervalo mínimo, jornada
 * máxima) dependem de lei e convenção e são avaliados pelo motor de cálculo com parâmetros
 * (pendência P-012), não aqui.
 */
export const shiftInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    code: optionalText(20),
    start: timeOfDaySchema,
    end: timeOfDaySchema,
    breakMinutes: z.number().int().min(0).max(720),
    isActive: z.boolean().default(true),
  })
  .superRefine((shift, ctx) => {
    if (shift.start === shift.end) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'Início e fim não podem ser iguais' });
    } else if (shift.breakMinutes >= shiftSpanMinutes(shift.start, shift.end)) {
      ctx.addIssue({
        code: 'custom',
        path: ['breakMinutes'],
        message: 'O intervalo não pode ser maior ou igual à duração do turno',
      });
    }
  });
export type ShiftInput = z.input<typeof shiftInputSchema>;

// ─── Escalas ──────────────────────────────────────────────────────────────────────

/**
 * - `cycle`: sequência de dias que se repete (5x2, 6x1, 12x36…). Cada dia tem um turno ou é
 *   folga.
 * - `flexible`: sem horários fixos; só a carga horária de referência.
 */
export const scheduleKindSchema = z.enum(['cycle', 'flexible']);

/**
 * Onde o ciclo começa:
 * - `monday`: o dia 1 do ciclo é segunda-feira (escalas semanais com folga em dia fixo);
 * - `assignment`: o dia 1 é a data de início do ciclo de cada funcionário (12x36, folgas
 *   rotativas).
 */
export const cycleAnchorSchema = z.enum(['monday', 'assignment']);

export const workScheduleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  kind: scheduleKindSchema,
  cycleAnchor: cycleAnchorSchema.nullable(),
  /** Turno de cada dia do ciclo (null = folga). Vazio em escala flexível. */
  days: z.array(z.uuid().nullable()),
  /** Carga de referência da escala flexível (minutos por semana). */
  weeklyMinutes: z.number().int().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  employeeCount: z.number().int(),
});
export type WorkSchedule = z.infer<typeof workScheduleSchema>;

export const MAX_CYCLE_DAYS = 56;

export const workScheduleInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    code: optionalText(20),
    kind: scheduleKindSchema,
    cycleAnchor: cycleAnchorSchema.nullable(),
    days: z.array(z.uuid().nullable()).max(MAX_CYCLE_DAYS),
    weeklyMinutes: z.number().int().min(1).max(10_080).nullable(),
    notes: optionalText(1000),
    isActive: z.boolean().default(true),
  })
  .superRefine((schedule, ctx) => {
    if (schedule.kind === 'cycle') {
      if (schedule.days.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['days'],
          message: 'O ciclo precisa ter pelo menos 2 dias',
        });
      } else if (schedule.days.every((day) => day === null)) {
        ctx.addIssue({
          code: 'custom',
          path: ['days'],
          message: 'O ciclo precisa ter ao menos um dia de trabalho',
        });
      }
      if (!schedule.cycleAnchor) {
        ctx.addIssue({
          code: 'custom',
          path: ['cycleAnchor'],
          message: 'Informe onde o ciclo começa',
        });
      }
      if (schedule.cycleAnchor === 'monday' && schedule.days.length % 7 !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['days'],
          message: 'Ciclo começando na segunda-feira deve ter semanas completas (7, 14, 21… dias)',
        });
      }
    } else if (schedule.weeklyMinutes === null) {
      ctx.addIssue({ code: 'custom', path: ['weeklyMinutes'], message: 'Informe a carga semanal' });
    }
  });
export type WorkScheduleInput = z.input<typeof workScheduleInputSchema>;

// ─── Feriados ─────────────────────────────────────────────────────────────────────

/** Abrangência: vale para todos, para uma UF, um município, ou só para uma unidade. */
export const holidayScopeSchema = z.enum(['national', 'state', 'city', 'company', 'unit']);
export type HolidayScope = z.infer<typeof holidayScopeSchema>;

export const holidaySchema = z.object({
  id: z.uuid(),
  date: calendarDateSchema,
  name: z.string(),
  scope: holidayScopeSchema,
  state: z.string().nullable(),
  city: z.string().nullable(),
  unitId: z.uuid().nullable(),
});
export type Holiday = z.infer<typeof holidaySchema>;

export const holidayInputSchema = z
  .object({
    date: calendarDateSchema,
    name: z.string().trim().min(2).max(120),
    scope: holidayScopeSchema,
    state: stateSchema.nullish().transform((v) => v ?? null),
    city: optionalText(100),
    unitId: z.uuid().nullable(),
  })
  .superRefine((holiday, ctx) => {
    const need = (path: 'state' | 'city' | 'unitId', ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (holiday.scope === 'state') need('state', holiday.state !== null, 'Informe a UF');
    if (holiday.scope === 'city') {
      need('state', holiday.state !== null, 'Informe a UF');
      need('city', holiday.city !== null, 'Informe o município');
    }
    if (holiday.scope === 'unit') need('unitId', holiday.unitId !== null, 'Informe a unidade');
  });
export type HolidayInput = z.input<typeof holidayInputSchema>;

export const holidayListQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

// ─── Vínculo funcionário-escala ───────────────────────────────────────────────────

export const scheduleAssignmentSchema = z.object({
  id: z.uuid(),
  scheduleId: z.uuid(),
  scheduleName: z.string(),
  startDate: calendarDateSchema,
  /** Último dia na escala; null = vigente. */
  endDate: calendarDateSchema.nullable(),
  /** Dia 1 do ciclo, para escalas ancoradas no funcionário. */
  cycleStartDate: calendarDateSchema,
});
export type ScheduleAssignment = z.infer<typeof scheduleAssignmentSchema>;

export const scheduleAssignmentInputSchema = z.object({
  scheduleId: z.uuid(),
  startDate: calendarDateSchema,
  /** Padrão: a própria data de início. */
  cycleStartDate: calendarDateSchema.nullish().transform((v) => v ?? null),
});
export type ScheduleAssignmentInput = z.input<typeof scheduleAssignmentInputSchema>;

// ─── Escala prevista ──────────────────────────────────────────────────────────────

export const MAX_PLANNED_DAYS = 62;

export const plannedRangeQuerySchema = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .refine((range) => range.from <= range.to, { path: ['to'], message: 'Fim antes do início' })
  .refine(
    (range) =>
      (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000 <
      MAX_PLANNED_DAYS,
    { path: ['to'], message: `Período de até ${MAX_PLANNED_DAYS} dias` },
  );

/**
 * Previsão de um dia para um funcionário. Só descreve a escala e os feriados; o que isso
 * significa em horas (extras, compensação, DSR) é decidido pelo motor de cálculo.
 */
export const plannedDaySchema = z.object({
  date: calendarDateSchema,
  /** Sem escala vinculada nesse dia. */
  unassigned: z.boolean(),
  scheduleId: z.uuid().nullable(),
  shift: shiftSchema
    .pick({
      id: true,
      name: true,
      start: true,
      end: true,
      crossesMidnight: true,
      breakMinutes: true,
      workMinutes: true,
    })
    .nullable(),
  /** Escala flexível: carga de referência semanal. */
  flexibleWeeklyMinutes: z.number().int().nullable(),
  holiday: z.object({ id: z.uuid(), name: z.string(), scope: holidayScopeSchema }).nullable(),
});
export type PlannedDay = z.infer<typeof plannedDaySchema>;
