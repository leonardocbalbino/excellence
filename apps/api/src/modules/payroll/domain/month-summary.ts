import type { PayrollItem, TimesheetDay } from '@excellence/shared';
import { addDays } from '../../scheduling/domain/planner';

/**
 * Até onde o mês é contado: o último dia do mês, ou ontem se o mês ainda não acabou (o dia
 * de hoje está em andamento).
 */
export function cutoffDate(month: string, today: string): string {
  const last = addDays(addDays(`${month}-01`, 32).slice(0, 8) + '01', -1);
  const yesterday = addDays(today, -1);
  return last < today ? last : yesterday;
}

export type MonthTotals = Pick<
  PayrollItem,
  | 'plannedMinutes'
  | 'workedMinutes'
  | 'balanceMinutes'
  | 'absenceDays'
  | 'justifiedDays'
  | 'incompleteDays'
  | 'pendingAdjustments'
>;

/**
 * Consolida os dias do espelho entre `from` e `to` (inclusive): previsto, trabalhado, faltas,
 * dias com atestado e marcações incompletas. Só fatos do ponto e da escala: horas extras,
 * adicionais, DSR e descontos são calculados pela contabilidade.
 */
export function summarizeDays(
  days: readonly TimesheetDay[],
  from: string,
  to: string,
): MonthTotals {
  const totals: MonthTotals = {
    plannedMinutes: 0,
    workedMinutes: 0,
    balanceMinutes: 0,
    absenceDays: 0,
    justifiedDays: 0,
    incompleteDays: 0,
    pendingAdjustments: 0,
  };
  for (const day of days) {
    if (day.date < from || day.date > to) continue;
    const working = day.planned.shift !== null && day.planned.holiday === null;
    const justified = day.justifications.length > 0;
    if (working) totals.plannedMinutes += day.planned.shift?.workMinutes ?? 0;
    totals.workedMinutes += day.workedMinutes;
    totals.pendingAdjustments += day.pendingAdjustments;
    if (day.incomplete) totals.incompleteDays += 1;
    if (working && justified) totals.justifiedDays += 1;
    else if (working && day.entries.length === 0) totals.absenceDays += 1;
  }
  totals.balanceMinutes = totals.workedMinutes - totals.plannedMinutes;
  return totals;
}
