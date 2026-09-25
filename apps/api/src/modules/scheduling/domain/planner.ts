import type { HolidayScope, PlannedDay } from '@excellence/shared';
import { minutesToTime } from '@excellence/shared';

export interface PlannerShift {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
}

export interface PlannerSchedule {
  id: string;
  kind: 'cycle' | 'flexible';
  cycleAnchor: 'monday' | 'assignment' | null;
  /** Turno de cada dia do ciclo (null = folga). */
  days: (PlannerShift | null)[];
  weeklyMinutes: number | null;
}

export interface PlannerAssignment {
  scheduleId: string;
  startDate: string;
  endDate: string | null;
  cycleStartDate: string;
}

export interface PlannerHoliday {
  id: string;
  date: string;
  name: string;
  scope: HolidayScope;
  state: string | null;
  city: string | null;
  unitId: string | null;
}

export interface PlannerUnit {
  id: string;
  state: string | null;
  city: string | null;
}

/** Uma segunda-feira qualquer: referência dos ciclos que começam na segunda. */
export const MONDAY_REFERENCE = '2024-01-01';

const DAY_MS = 86_400_000;

export function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Posição do dia no ciclo (0 = primeiro dia), inclusive para datas antes da âncora. */
export function cycleIndex(date: string, anchor: string, cycleLength: number): number {
  const offset = daysBetween(anchor, date) % cycleLength;
  return offset < 0 ? offset + cycleLength : offset;
}

function normalizeCity(city: string): string {
  return city.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/**
 * O feriado vale para a unidade? Nacional e da empresa valem sempre; estadual e municipal
 * dependem da UF/município da unidade (sem endereço cadastrado, não se aplicam); "unit" só
 * na própria unidade.
 */
export function holidayApplies(holiday: PlannerHoliday, unit: PlannerUnit): boolean {
  switch (holiday.scope) {
    case 'national':
    case 'company':
      return true;
    case 'state':
      return unit.state !== null && unit.state === holiday.state;
    case 'city':
      return (
        unit.state !== null &&
        unit.city !== null &&
        holiday.city !== null &&
        unit.state === holiday.state &&
        normalizeCity(unit.city) === normalizeCity(holiday.city)
      );
    case 'unit':
      return holiday.unitId === unit.id;
  }
}

function toPlannedShift(shift: PlannerShift): NonNullable<PlannedDay['shift']> {
  const span =
    shift.endMinute > shift.startMinute
      ? shift.endMinute - shift.startMinute
      : shift.endMinute - shift.startMinute + 1440;
  return {
    id: shift.id,
    name: shift.name,
    start: minutesToTime(shift.startMinute),
    end: minutesToTime(shift.endMinute),
    crossesMidnight: shift.endMinute <= shift.startMinute,
    breakMinutes: shift.breakMinutes,
    workMinutes: span - shift.breakMinutes,
  };
}

/**
 * Escala prevista dia a dia. Descreve só o que a escala e os feriados dizem; não aplica
 * nenhuma regra legal (compensação de feriado, DSR, horas extras): isso é do motor de
 * cálculo, com parâmetros (pendências P-012 a P-014).
 */
export function planDays(input: {
  from: string;
  to: string;
  assignments: readonly PlannerAssignment[];
  schedules: ReadonlyMap<string, PlannerSchedule>;
  holidays: readonly PlannerHoliday[];
  unit: PlannerUnit;
}): PlannedDay[] {
  const days: PlannedDay[] = [];
  const total = daysBetween(input.from, input.to);
  for (let offset = 0; offset <= total; offset++) {
    const date = addDays(input.from, offset);
    const assignment = input.assignments.find(
      (a) => a.startDate <= date && (a.endDate === null || date <= a.endDate),
    );
    const schedule = assignment ? input.schedules.get(assignment.scheduleId) : undefined;
    const holiday = input.holidays.find((h) => h.date === date && holidayApplies(h, input.unit));

    let shift: PlannerShift | null = null;
    if (schedule?.kind === 'cycle' && schedule.days.length > 0 && assignment) {
      const anchor =
        schedule.cycleAnchor === 'monday' ? MONDAY_REFERENCE : assignment.cycleStartDate;
      shift = schedule.days[cycleIndex(date, anchor, schedule.days.length)] ?? null;
    }

    days.push({
      date,
      unassigned: !schedule,
      scheduleId: schedule?.id ?? null,
      shift: shift ? toPlannedShift(shift) : null,
      flexibleWeeklyMinutes: schedule?.kind === 'flexible' ? schedule.weeklyMinutes : null,
      holiday: holiday ? { id: holiday.id, name: holiday.name, scope: holiday.scope } : null,
    });
  }
  return days;
}
