import type { PlannedDay, TimesheetDay } from '@excellence/shared';
import { addDays } from '../../scheduling/domain/planner';
import { toZoned } from './zoned-time';

export interface EffectiveEntry {
  id: string;
  recordedAt: Date;
  kind: 'clock' | 'inclusion' | 'disregard';
  geofenceStatus: TimesheetDay['entries'][number]['geofenceStatus'];
}

/**
 * Dia de trabalho a que pertence uma marcação. Pelo calendário local, exceto quando o dia
 * anterior tem turno que atravessa a meia-noite e a marcação cai até o fim desse turno mais
 * a tolerância (`graceMinutes`): aí ela é do dia anterior.
 */
export function workDateOf(
  local: { date: string; minuteOfDay: number },
  plannedByDate: ReadonlyMap<string, PlannedDay>,
  graceMinutes: number,
): string {
  const previousDate = addDays(local.date, -1);
  const previousShift = plannedByDate.get(previousDate)?.shift;
  if (previousShift?.crossesMidnight) {
    const [h, m] = previousShift.end.split(':').map(Number);
    const endMinute = (h ?? 0) * 60 + (m ?? 0);
    if (local.minuteOfDay <= endMinute + graceMinutes) return previousDate;
  }
  return local.date;
}

/**
 * Monta o espelho: agrupa as marcações efetivas por dia de trabalho e soma os pares
 * entrada/saída. Não aplica regra legal (horas extras, noturno, tolerâncias): isso é do
 * motor de cálculo (1B.4), com parâmetros.
 */
export function buildTimesheetDays(input: {
  planned: readonly PlannedDay[];
  entries: readonly EffectiveEntry[];
  timezone: string;
  graceMinutes: number;
  pendingByDate: ReadonlyMap<string, number>;
  /** Atestados aceitos; cada um aparece em todos os dias do seu período. */
  justifications?: readonly {
    id: string;
    startDate: string;
    endDate: string;
    startTime: string | null;
    endTime: string | null;
  }[];
}): TimesheetDay[] {
  const plannedByDate = new Map(input.planned.map((day) => [day.date, day]));
  const byWorkDate = new Map<
    string,
    { entry: EffectiveEntry; local: ReturnType<typeof toZoned> }[]
  >();
  for (const entry of [...input.entries].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  )) {
    const local = toZoned(entry.recordedAt, input.timezone);
    const workDate = workDateOf(local, plannedByDate, input.graceMinutes);
    byWorkDate.set(workDate, [...(byWorkDate.get(workDate) ?? []), { entry, local }]);
  }

  return input.planned.map((planned) => {
    const items = byWorkDate.get(planned.date) ?? [];
    let workedMinutes = 0;
    for (let i = 0; i + 1 < items.length; i += 2) {
      const start = items[i]?.entry.recordedAt.getTime() ?? 0;
      const end = items[i + 1]?.entry.recordedAt.getTime() ?? 0;
      workedMinutes += Math.round((end - start) / 60_000);
    }
    return {
      date: planned.date,
      planned,
      entries: items.map(({ entry, local }) => ({
        id: entry.id,
        localTime: local.time,
        nextDay: local.date !== planned.date,
        kind: entry.kind,
        geofenceStatus: entry.geofenceStatus,
      })),
      workedMinutes,
      incomplete: items.length % 2 === 1,
      pendingAdjustments: input.pendingByDate.get(planned.date) ?? 0,
      justifications: (input.justifications ?? [])
        .filter((j) => j.startDate <= planned.date && planned.date <= j.endDate)
        .map((j) => ({
          type: 'medical_certificate' as const,
          id: j.id,
          startTime: j.startTime,
          endTime: j.endTime,
        })),
    };
  });
}
