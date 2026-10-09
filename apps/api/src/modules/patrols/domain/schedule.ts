import type { PatrolSlotStatus } from '@excellence/shared';
import { minutesToTime } from '@excellence/shared';
import { fromZoned } from '../../time-tracking/domain/zoned-time';

/**
 * Quanto antes do horário previsto uma ronda iniciada ainda conta para ele. Depois do
 * horário, vale até o fim do tempo previsto da rota. Regra operacional provisória (P-020).
 */
export const SLOT_EARLY_MINUTES = 30;

const MINUTE = 60_000;

export interface RouteSchedule {
  startMinutes: readonly number[];
  weekdays: readonly number[];
  expectedMinutes: number;
}

/** Dia da semana de uma data de calendário (0 = domingo). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Horários previstos da rota na data (fuso da unidade), em ordem. */
export function slotsOn(route: RouteSchedule, date: string, timezone: string): Date[] {
  if (!route.weekdays.includes(weekdayOf(date))) return [];
  return [...route.startMinutes]
    .sort((a, b) => a - b)
    .map((minute) => fromZoned(date, minutesToTime(minute), timezone));
}

/**
 * Horário previsto que uma ronda iniciada agora cumpre: o mais cedo ainda livre entre os que
 * aceitam o início agora (de `SLOT_EARLY_MINUTES` antes até o fim do tempo previsto). Sem
 * nenhum, a ronda fica fora de horário (null).
 */
export function pickSlot(
  slots: readonly Date[],
  taken: ReadonlySet<number>,
  now: Date,
  expectedMinutes: number,
): Date | null {
  const t = now.getTime();
  return (
    slots.find(
      (slot) =>
        !taken.has(slot.getTime()) &&
        t >= slot.getTime() - SLOT_EARLY_MINUTES * MINUTE &&
        t <= slot.getTime() + expectedMinutes * MINUTE,
    ) ?? null
  );
}

export function slotStatus(
  slot: Date,
  expectedMinutes: number,
  run: { status: 'in_progress' | 'completed' | 'incomplete' } | null,
  now: Date,
): PatrolSlotStatus {
  if (run) return run.status === 'in_progress' ? 'in_progress' : 'done';
  return now.getTime() > slot.getTime() + expectedMinutes * MINUTE ? 'missed' : 'upcoming';
}

/** Minutos além do fim previsto: até agora (em andamento) ou até o encerramento. */
export function lateMinutes(expectedEndAt: Date, finishedAt: Date | null, now: Date): number {
  const end = (finishedAt ?? now).getTime();
  return Math.max(0, Math.floor((end - expectedEndAt.getTime()) / MINUTE));
}
