import { describe, expect, it } from 'vitest';
import { nationalHolidaySuggestions } from './national-holidays';
import {
  addDays,
  cycleIndex,
  holidayApplies,
  planDays,
  type PlannerHoliday,
  type PlannerSchedule,
  type PlannerShift,
} from './planner';

const day: PlannerShift = {
  id: 'day',
  name: 'Diurno',
  startMinute: 480,
  endMinute: 1020,
  breakMinutes: 60,
};
const twelve: PlannerShift = {
  id: 'd12',
  name: '12h',
  startMinute: 420,
  endMinute: 1140,
  breakMinutes: 60,
};
const night: PlannerShift = {
  id: 'n12',
  name: 'Noturno',
  startMinute: 1140,
  endMinute: 420,
  breakMinutes: 60,
};

const fiveTwo: PlannerSchedule = {
  id: '5x2',
  kind: 'cycle',
  cycleAnchor: 'monday',
  days: [day, day, day, day, day, null, null],
  weeklyMinutes: null,
};
const twelveThirtySix: PlannerSchedule = {
  id: '12x36',
  kind: 'cycle',
  cycleAnchor: 'assignment',
  days: [twelve, null],
  weeklyMinutes: null,
};
const flexible: PlannerSchedule = {
  id: 'flex',
  kind: 'flexible',
  cycleAnchor: null,
  days: [],
  weeklyMinutes: 2640,
};

const unit = { id: 'u1', state: 'MA', city: 'São Luís' };
const schedules = new Map([fiveTwo, twelveThirtySix, flexible].map((s) => [s.id, s]));
const holiday = (overrides: Partial<PlannerHoliday>): PlannerHoliday => ({
  id: 'h',
  date: '2026-11-20',
  name: 'Feriado',
  scope: 'national',
  state: null,
  city: null,
  unitId: null,
  ...overrides,
});

describe('ciclos', () => {
  it('cycleIndex funciona antes e depois da âncora', () => {
    expect(cycleIndex('2026-09-21', '2024-01-01', 7)).toBe(0); // segunda
    expect(cycleIndex('2026-09-27', '2024-01-01', 7)).toBe(6); // domingo
    expect(cycleIndex('2023-12-31', '2024-01-01', 7)).toBe(6); // antes da âncora
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('5x2 começando na segunda: trabalha de segunda a sexta', () => {
    const days = planDays({
      from: '2026-09-21',
      to: '2026-09-27',
      assignments: [
        { scheduleId: '5x2', startDate: '2026-01-01', endDate: null, cycleStartDate: '2026-01-01' },
      ],
      schedules,
      holidays: [],
      unit,
    });
    expect(days.map((d) => d.shift?.id ?? '-')).toEqual([
      'day',
      'day',
      'day',
      'day',
      'day',
      '-',
      '-',
    ]);
    expect(days[0]?.shift).toMatchObject({
      start: '08:00',
      end: '17:00',
      workMinutes: 480,
      crossesMidnight: false,
    });
  });

  it('12x36 ancorada no início do funcionário: dia sim, dia não', () => {
    const days = planDays({
      from: '2026-09-23',
      to: '2026-09-28',
      assignments: [
        {
          scheduleId: '12x36',
          startDate: '2026-09-01',
          endDate: null,
          cycleStartDate: '2026-09-24',
        },
      ],
      schedules,
      holidays: [],
      unit,
    });
    expect(days.map((d) => d.shift?.id ?? '-')).toEqual(['-', 'd12', '-', 'd12', '-', 'd12']);
  });

  it('turno noturno atravessa a meia-noite', () => {
    const schedule: PlannerSchedule = { ...twelveThirtySix, id: 'n', days: [night, null] };
    const [first] = planDays({
      from: '2026-09-24',
      to: '2026-09-24',
      assignments: [
        { scheduleId: 'n', startDate: '2026-09-24', endDate: null, cycleStartDate: '2026-09-24' },
      ],
      schedules: new Map([['n', schedule]]),
      holidays: [],
      unit,
    });
    expect(first?.shift).toMatchObject({
      start: '19:00',
      end: '07:00',
      crossesMidnight: true,
      workMinutes: 660,
    });
  });

  it('troca de escala no meio do período e dias sem vínculo', () => {
    const days = planDays({
      from: '2026-09-18',
      to: '2026-09-22',
      assignments: [
        {
          scheduleId: '5x2',
          startDate: '2026-09-19',
          endDate: '2026-09-20',
          cycleStartDate: '2026-09-19',
        },
        {
          scheduleId: 'flex',
          startDate: '2026-09-21',
          endDate: null,
          cycleStartDate: '2026-09-21',
        },
      ],
      schedules,
      holidays: [],
      unit,
    });
    expect(days.map((d) => [d.unassigned, d.scheduleId, d.flexibleWeeklyMinutes])).toEqual([
      [true, null, null],
      [false, '5x2', null],
      [false, '5x2', null],
      [false, 'flex', 2640],
      [false, 'flex', 2640],
    ]);
  });
});

describe('feriados', () => {
  it.each([
    [holiday({ scope: 'national' }), true],
    [holiday({ scope: 'company' }), true],
    [holiday({ scope: 'state', state: 'MA' }), true],
    [holiday({ scope: 'state', state: 'RJ' }), false],
    [holiday({ scope: 'city', state: 'MA', city: 'sao luis' }), true],
    [holiday({ scope: 'city', state: 'MA', city: 'Imperatriz' }), false],
    [holiday({ scope: 'unit', unitId: 'u1' }), true],
    [holiday({ scope: 'unit', unitId: 'u2' }), false],
  ])('%j se aplica à unidade de São Luís: %s', (h, expected) => {
    expect(holidayApplies(h, unit)).toBe(expected);
  });

  it('feriado estadual não se aplica a unidade sem endereço', () => {
    expect(
      holidayApplies(holiday({ scope: 'state', state: 'MA' }), {
        id: 'x',
        state: null,
        city: null,
      }),
    ).toBe(false);
  });

  it('marca o feriado sem alterar o turno previsto', () => {
    const [friday] = planDays({
      from: '2026-11-20',
      to: '2026-11-20',
      assignments: [
        { scheduleId: '5x2', startDate: '2026-01-01', endDate: null, cycleStartDate: '2026-01-01' },
      ],
      schedules,
      holidays: [holiday({ name: 'Consciência Negra' })],
      unit,
    });
    expect(friday).toMatchObject({ shift: { id: 'day' }, holiday: { name: 'Consciência Negra' } });
  });

  it('sugere os feriados nacionais de data fixa com a base legal', () => {
    const suggestions = nationalHolidaySuggestions(2026);
    expect(suggestions).toHaveLength(9);
    expect(suggestions).toContainEqual({
      date: '2026-11-20',
      name: 'Dia Nacional de Zumbi e da Consciência Negra',
      legalBasis: 'Lei 14.759/2023',
    });
  });
});
