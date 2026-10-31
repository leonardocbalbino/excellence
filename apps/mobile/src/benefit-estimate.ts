import type { BenefitCalculation, TimesheetDay } from '@excellence/shared';

/**
 * Prévia do VA/VT por dia no mês, pelo próprio espelho de ponto: a mesma regra da API
 * (ADR 0021), contando até ontem. O valor que vale é o da tela de VA/VT do RH e do
 * fechamento, que pode ter ajuste.
 * - conta o dia com marcação no ponto;
 * - na regra "ou com atestado", também o dia de turno sem marcação coberto por atestado.
 */
export function estimateDays(
  days: readonly TimesheetDay[],
  calculation: BenefitCalculation,
  validity: { startDate: string; endDate: string | null },
  until: string,
): number {
  return days.filter((day) => {
    if (day.date < validity.startDate || day.date > until) return false;
    if (validity.endDate !== null && day.date > validity.endDate) return false;
    if (day.entries.length > 0) return true;
    if (calculation !== 'per_worked_or_justified_day') return false;
    return (
      day.planned.shift !== null && day.planned.holiday === null && day.justifications.length > 0
    );
  }).length;
}
