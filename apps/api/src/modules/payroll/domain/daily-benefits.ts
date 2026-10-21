import {
  type BenefitCalculation,
  type DailyBenefitKind,
  type DailyBenefitLine,
  type DailyBenefits,
  fromCents,
  type TimesheetDay,
} from '@excellence/shared';

/** Atribuição de VA ou VT calculado por dia, com a vigência em AAAA-MM-DD. */
export interface DailyAssignment {
  kind: DailyBenefitKind;
  calculation: Exclude<BenefitCalculation, 'monthly'>;
  startDate: string;
  endDate: string | null;
  dailyValueCents: number;
}

export interface DailyAdjustment {
  id: string;
  kind: DailyBenefitKind;
  days: number | null;
  dailyValueCents: number | null;
  reason: string;
}

/**
 * O dia conta para o benefício:
 * - com marcação no ponto (inclusive folga ou feriado trabalhado);
 * - na regra "ou com atestado", também o dia de turno sem marcação coberto por atestado
 *   aceito (mesmo critério do fechamento para "dias com atestado").
 */
function counts(day: TimesheetDay, calculation: DailyAssignment['calculation']): boolean {
  if (day.entries.length > 0) return true;
  if (calculation !== 'per_worked_or_justified_day') return false;
  const working = day.planned.shift !== null && day.planned.holiday === null;
  return working && day.justifications.length > 0;
}

function line(
  days: readonly TimesheetDay[],
  from: string,
  to: string,
  assignments: readonly DailyAssignment[],
  adjustment: DailyAdjustment | undefined,
): DailyBenefitLine | null {
  if (assignments.length === 0 && !adjustment) return null;
  const counted = new Set<string>();
  let totalCents = 0;
  for (const assignment of assignments) {
    const start = assignment.startDate > from ? assignment.startDate : from;
    const end = assignment.endDate !== null && assignment.endDate < to ? assignment.endDate : to;
    for (const day of days) {
      if (day.date < start || day.date > end || !counts(day, assignment.calculation)) continue;
      counted.add(day.date);
      totalCents += assignment.dailyValueCents;
    }
  }
  // Valor-base diário: o total dividido pelos dias (ônibus + metrô somam). Sem dias contados,
  // a soma dos valores das atribuições que começaram por último (a vigente no fim do mês).
  const latest = assignments.reduce<string>(
    (max, a) => (a.startDate > max ? a.startDate : max),
    '',
  );
  const dailyCents =
    counted.size > 0
      ? Math.round(totalCents / counted.size)
      : assignments
          .filter((a) => a.startDate === latest)
          .reduce((sum, a) => sum + a.dailyValueCents, 0);
  const calculated = {
    days: counted.size,
    dailyValue: fromCents(dailyCents),
    total: fromCents(totalCents),
  };
  if (!adjustment) return { ...calculated, calculated, adjustment: null };

  const adjustedDays = adjustment.days ?? counted.size;
  const adjustedDailyCents = adjustment.dailyValueCents ?? dailyCents;
  return {
    days: adjustedDays,
    dailyValue: fromCents(adjustedDailyCents),
    total: fromCents(adjustedDays * adjustedDailyCents),
    calculated,
    adjustment: {
      id: adjustment.id,
      days: adjustment.days,
      dailyValue:
        adjustment.dailyValueCents === null ? null : fromCents(adjustment.dailyValueCents),
      reason: adjustment.reason,
    },
  };
}

/**
 * VA e VT do mês pelo espelho de ponto entre `from` e `to` (inclusive), dentro da vigência
 * de cada atribuição (ADR 0021). Com ajuste do RH, os dias e/ou o valor diário informados
 * substituem os calculados e o total passa a ser dias × valor diário.
 */
export function summarizeDailyBenefits(
  days: readonly TimesheetDay[],
  from: string,
  to: string,
  assignments: readonly DailyAssignment[],
  adjustments: readonly DailyAdjustment[],
): DailyBenefits {
  const of = (kind: DailyBenefitKind) =>
    line(
      days,
      from,
      to,
      assignments.filter((a) => a.kind === kind),
      adjustments.find((a) => a.kind === kind),
    );
  const food = of('food');
  const transport = of('transport');
  const totalCents = Math.round(((food?.total ?? 0) + (transport?.total ?? 0)) * 100);
  return { food, transport, total: fromCents(totalCents) };
}
