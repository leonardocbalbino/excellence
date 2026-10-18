import { fromCents, type ShiftPay, type TimesheetDay } from '@excellence/shared';

export interface RateRow {
  unitId: string;
  scheduleId: string;
  /** AAAA-MM */
  validFrom: string;
  amountCents: number;
}

/**
 * Valor por plantão vigente em `month` para cada escala do posto: o de vigência mais recente
 * que já começou. É o que faz o reajuste valer sozinho na virada do mês (ADR 0020).
 */
export function ratesForMonth(
  rows: readonly RateRow[],
  unitId: string,
  month: string,
): Map<string, number> {
  const best = new Map<string, RateRow>();
  for (const row of rows) {
    if (row.unitId !== unitId || row.validFrom > month) continue;
    const current = best.get(row.scheduleId);
    if (!current || row.validFrom > current.validFrom) best.set(row.scheduleId, row);
  }
  return new Map([...best].map(([scheduleId, row]) => [scheduleId, row.amountCents]));
}

/**
 * Plantões do espelho entre `from` e `to` (inclusive), por escala:
 * - trabalhado: dia com turno previsto e ao menos uma marcação (feriado trabalhado conta);
 * - com atestado: dia com turno, sem marcação e com atestado aceito. Fica separado e sem
 *   valor, porque o abono depende de regra legal e de convenção (P-017).
 * Marcação em dia de folga não vira plantão.
 */
export function summarizeShiftPay(
  days: readonly TimesheetDay[],
  from: string,
  to: string,
  scheduleNames: ReadonlyMap<string, string>,
  rates: ReadonlyMap<string, number>,
): ShiftPay {
  const counts = new Map<string, { shifts: number; justifiedShifts: number }>();
  for (const day of days) {
    if (day.date < from || day.date > to) continue;
    const scheduleId = day.planned.scheduleId;
    if (!scheduleId || !day.planned.shift) continue;
    const count = counts.get(scheduleId) ?? { shifts: 0, justifiedShifts: 0 };
    if (day.entries.length > 0) count.shifts += 1;
    else if (day.justifications.length > 0) count.justifiedShifts += 1;
    else continue;
    counts.set(scheduleId, count);
  }

  let shifts = 0;
  let totalCents = 0;
  const lines = [...counts].map(([scheduleId, count]) => {
    const rateCents = rates.get(scheduleId) ?? null;
    const amountCents = rateCents === null ? 0 : rateCents * count.shifts;
    shifts += count.shifts;
    totalCents += amountCents;
    return {
      scheduleId,
      schedule: scheduleNames.get(scheduleId) ?? 'Escala',
      rate: rateCents === null ? null : fromCents(rateCents),
      shifts: count.shifts,
      justifiedShifts: count.justifiedShifts,
      amount: fromCents(amountCents),
    };
  });
  lines.sort((a, b) => a.schedule.localeCompare(b.schedule, 'pt-BR'));
  return { lines, shifts, total: fromCents(totalCents) };
}
