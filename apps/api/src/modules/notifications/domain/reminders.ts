import type { PlannedDay, PushKind } from '@excellence/shared';
import { addDays } from '../../scheduling/domain/planner';
import { fromZoned } from '../../time-tracking/domain/zoned-time';

/**
 * Quando os lembretes saem (regra operacional, não legal; ajuste aqui se a operação pedir):
 * - ronda: 10 min antes do horário; e, se ninguém iniciou, de 15 a 45 min depois;
 * - entrada: de 10 min antes a 30 min depois do início do turno, sem nenhuma marcação;
 * - saída: até 60 min depois do fim do turno, com número ímpar de marcações.
 * O job roda a cada minuto e cada lembrete sai uma vez só (chave no Redis).
 */
export const PATROL_UPCOMING_MINUTES = 10;
export const PATROL_LATE_FROM_MINUTES = 15;
export const PATROL_LATE_UNTIL_MINUTES = 45;
export const CLOCK_IN_BEFORE_MINUTES = 10;
export const CLOCK_IN_AFTER_MINUTES = 30;
export const CLOCK_OUT_AFTER_MINUTES = 60;

const MINUTE = 60_000;

function within(now: Date, from: number, until: number): boolean {
  const t = now.getTime();
  return t >= from && t < until;
}

/** Lembrete de um horário de ronda; `started`: alguém já iniciou a ronda desse horário. */
export function patrolReminder(
  slot: Date,
  started: boolean,
  now: Date,
): Extract<PushKind, 'patrol_upcoming' | 'patrol_late'> | null {
  if (started) return null;
  const at = slot.getTime();
  if (within(now, at - PATROL_UPCOMING_MINUTES * MINUTE, at)) return 'patrol_upcoming';
  if (
    within(now, at + PATROL_LATE_FROM_MINUTES * MINUTE, at + PATROL_LATE_UNTIL_MINUTES * MINUTE)
  ) {
    return 'patrol_late';
  }
  return null;
}

export interface ClockReminder {
  kind: Extract<PushKind, 'clock_in_reminder' | 'clock_out_reminder'>;
  /** HH:MM do início (entrada) ou do fim (saída) do turno. */
  time: string;
}

/**
 * Lembrete de ponto do dia de trabalho. Sem turno, em feriado ou com atestado aceito, nada.
 * O turno que atravessa a meia-noite termina no dia seguinte.
 */
export function clockReminder(
  planned: PlannedDay,
  entries: number,
  justified: boolean,
  timezone: string,
  now: Date,
): ClockReminder | null {
  const shift = planned.shift;
  if (!shift || planned.holiday || justified) return null;
  const start = fromZoned(planned.date, shift.start, timezone).getTime();
  const endDate = shift.crossesMidnight ? addDays(planned.date, 1) : planned.date;
  const end = fromZoned(endDate, shift.end, timezone).getTime();
  if (
    entries === 0 &&
    within(now, start - CLOCK_IN_BEFORE_MINUTES * MINUTE, start + CLOCK_IN_AFTER_MINUTES * MINUTE)
  ) {
    return { kind: 'clock_in_reminder', time: shift.start };
  }
  if (entries % 2 === 1 && within(now, end, end + CLOCK_OUT_AFTER_MINUTES * MINUTE)) {
    return { kind: 'clock_out_reminder', time: shift.end };
  }
  return null;
}
