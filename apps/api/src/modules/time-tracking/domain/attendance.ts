import type { AttendanceStatus, PlannedDay } from '@excellence/shared';

/**
 * Situação do funcionário no dia, só pelas marcações efetivas e pela escala. Não aplica
 * tolerância nem regra legal (isso é do motor de cálculo): marcação ímpar é "em jornada",
 * mesmo que seja uma saída esquecida.
 */
export function attendanceStatus(
  entries: number,
  planned: Pick<PlannedDay, 'shift' | 'holiday'>,
  justified: boolean,
): AttendanceStatus {
  if (entries % 2 === 1) return 'present';
  if (entries > 0) return 'finished';
  if (justified) return 'justified';
  return planned.shift && !planned.holiday ? 'no_entries' : 'off';
}
