import { z } from 'zod';
import { calendarDateSchema } from '../br/fields.js';
import {
  type PlannedDay,
  plannedDaySchema,
  timeOfDaySchema,
  timeToMinutes,
} from '../scheduling/scheduling.schemas.js';

/**
 * Sequência das marcações do dia (ponto do funcionário). O registro continua sendo só a
 * marcação, sem tipo (ADR 0012): o nome vem da posição no dia de trabalho e da configuração
 * da empresa. Com o almoço: entrada, saída para almoço, retorno e saída. Sem: entrada e saída.
 */
export const punchKindSchema = z.enum(['entry', 'break_start', 'break_end', 'exit']);
export type PunchKind = z.infer<typeof punchKindSchema>;

export const PUNCH_LABELS: Record<PunchKind, string> = {
  entry: 'Entrada',
  break_start: 'Saída para almoço',
  break_end: 'Retorno do almoço',
  exit: 'Saída',
};

export const PUNCH_ACTIONS: Record<PunchKind, string> = {
  entry: 'Registrar entrada',
  break_start: 'Registrar saída para almoço',
  break_end: 'Registrar retorno do almoço',
  exit: 'Registrar saída',
};

const WITH_BREAK: readonly PunchKind[] = ['entry', 'break_start', 'break_end', 'exit'];
const WITHOUT_BREAK: readonly PunchKind[] = ['entry', 'exit'];

export function punchSequence(breakPunches: boolean): readonly PunchKind[] {
  return breakPunches ? WITH_BREAK : WITHOUT_BREAK;
}

/** Próxima marcação depois de `count` marcações no dia; null = dia completo. */
export function nextPunch(breakPunches: boolean, count: number): PunchKind | null {
  return punchSequence(breakPunches)[count] ?? null;
}

/**
 * Nome da marcação na posição `index` (0 = primeira). Marcações além da sequência (incluídas
 * por ajuste) aparecem numeradas.
 */
export function punchLabel(breakPunches: boolean, index: number): string {
  const kind = punchSequence(breakPunches)[index];
  return kind ? PUNCH_LABELS[kind] : `Marcação ${String(index + 1)}`;
}

export const clockBlockSchema = z.enum(['day_off', 'day_complete']);
export type ClockBlock = z.infer<typeof clockBlockSchema>;

export const CLOCK_BLOCK_MESSAGES: Record<ClockBlock, string> = {
  day_off:
    'Hoje é folga na sua escala, então o ponto não abre. Se você foi chamado para trabalhar, fale com o RH.',
  day_complete:
    'Você já fez todas as marcações de hoje. Se alguma saiu errada, peça um ajuste de ponto.',
};

/**
 * Folga: dia com escala vinculada e sem turno. Sem escala vinculada ou com escala flexível
 * não é folga (não há como saber).
 */
export function isDayOff(
  planned: Pick<PlannedDay, 'unassigned' | 'shift' | 'flexibleWeeklyMinutes'>,
) {
  return !planned.unassigned && planned.shift === null && planned.flexibleWeeklyMinutes === null;
}

/**
 * Por que a próxima marcação não é aceita, ou null. A folga só barra a marcação que abriria
 * a jornada; com a jornada aberta (número ímpar de marcações), a saída sempre passa.
 */
export function clockBlock(input: {
  planned: Pick<PlannedDay, 'unassigned' | 'shift' | 'flexibleWeeklyMinutes'>;
  count: number;
  breakPunches: boolean;
  blockOffDay: boolean;
}): ClockBlock | null {
  if (input.count === 0 && input.blockOffDay && isDayOff(input.planned)) return 'day_off';
  if (input.count % 2 === 0 && input.count >= punchSequence(input.breakPunches).length) {
    return 'day_complete';
  }
  return null;
}

/** Soma minutos a um HH:MM, dando a volta na meia-noite. */
export function addMinutesToTime(time: string, minutes: number): string {
  const total = (((timeToMinutes(time) + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Retorno previsto do almoço: hora da saída para almoço mais o intervalo do turno. Só com as
 * marcações de almoço ligadas e o turno com intervalo.
 */
export function expectedBreakEnd(input: {
  breakPunches: boolean;
  planned: Pick<PlannedDay, 'shift'>;
  breakStartTime: string | null;
}): string | null {
  const minutes = input.planned.shift?.breakMinutes ?? 0;
  if (!input.breakPunches || !input.breakStartTime || minutes <= 0) return null;
  return addMinutesToTime(input.breakStartTime, minutes);
}

/** Dia de trabalho atual do funcionário, para a tela de ponto. */
export const clockDaySchema = z.object({
  /** Dia de trabalho (o turno que vira a meia-noite fica no dia em que começou). */
  workDate: calendarDateSchema,
  planned: plannedDaySchema,
  breakPunches: z.boolean(),
  blockOffDay: z.boolean(),
  /** Marcações efetivas do dia de trabalho, em ordem. */
  entries: z.array(
    z.object({ localTime: timeOfDaySchema, nextDay: z.boolean(), offline: z.boolean() }),
  ),
  next: punchKindSchema.nullable(),
  blocked: clockBlockSchema.nullable(),
  /** Fim do turno da escala. */
  expectedExit: timeOfDaySchema.nullable(),
  expectedBreakEnd: timeOfDaySchema.nullable(),
});
export type ClockDay = z.infer<typeof clockDaySchema>;
