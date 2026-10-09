import type { AttendanceStatus, DailyAttendance } from '@excellence/shared';

export const dailyAttendanceQueryKey = ['daily-attendance'] as const;

export type AttendanceItem = DailyAttendance['items'][number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Em jornada',
  finished: 'Encerrou',
  no_entries: 'Sem registro',
  justified: 'Atestado',
  off: 'Folga',
};

/** HH:MM agora no fuso da unidade. */
function nowIn(timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

/**
 * Sem nenhuma marcação depois do horário de início do turno (no fuso da unidade). Não é
 * "atraso" no sentido legal: tolerâncias ficam para o motor de cálculo.
 */
export function isOverdue(item: AttendanceItem, isToday: boolean): boolean {
  if (item.status !== 'no_entries' || !item.planned.shift) return false;
  if (!isToday) return true;
  return nowIn(item.timezone) >= item.planned.shift.start;
}

/** Escalado no dia: tem turno (fora de feriado) ou marcou mesmo assim. */
export function isExpected(item: AttendanceItem): boolean {
  return (item.planned.shift !== null && item.planned.holiday === null) || item.entries.length > 0;
}

export interface AttendanceSummary {
  expected: number;
  present: number;
  finished: number;
  overdue: number;
  justified: number;
}

export function summarize(items: readonly AttendanceItem[], isToday: boolean): AttendanceSummary {
  return {
    expected: items.filter(isExpected).length,
    present: items.filter((i) => i.status === 'present').length,
    finished: items.filter((i) => i.status === 'finished').length,
    overdue: items.filter((i) => isOverdue(i, isToday)).length,
    justified: items.filter((i) => i.status === 'justified').length,
  };
}

/** Presença por unidade (quantos marcaram entre os escalados). */
export function byUnit(items: readonly AttendanceItem[]) {
  const units = new Map<string, { id: string; name: string; expected: number; arrived: number }>();
  for (const item of items) {
    if (!isExpected(item)) continue;
    const unit = item.employee.unit;
    const row = units.get(unit.id) ?? { ...unit, expected: 0, arrived: 0 };
    row.expected += 1;
    if (item.entries.length > 0) row.arrived += 1;
    units.set(unit.id, row);
  }
  return [...units.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
