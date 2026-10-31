import type { TimesheetDay } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { ratesForMonth, summarizeShiftPay } from './shift-pay';

const UNIT = '01900000-0000-7000-8000-000000000a01';
const OTHER_UNIT = '01900000-0000-7000-8000-000000000a02';
const DAY_SCHEDULE = '01900000-0000-7000-8000-000000000b01';
const NIGHT_SCHEDULE = '01900000-0000-7000-8000-000000000b02';

const shift = {
  id: '01900000-0000-7000-8000-000000000901',
  name: '12h diurno',
  start: '07:00',
  end: '19:00',
  crossesMidnight: false,
  breakMinutes: 60,
  workMinutes: 660,
};

const entry = {
  id: '01900000-0000-7000-8000-000000000e01',
  localTime: '07:00',
  nextDay: false,
  kind: 'clock' as const,
  geofenceStatus: 'inside' as const,
};

function day(
  date: string,
  scheduleId: string | null,
  overrides: Partial<TimesheetDay> = {},
  withShift = true,
): TimesheetDay {
  return {
    date,
    planned: {
      date,
      unassigned: scheduleId === null,
      scheduleId,
      shift: withShift ? shift : null,
      flexibleWeeklyMinutes: null,
      holiday: null,
    },
    entries: [],
    workedMinutes: 0,
    incomplete: false,
    pendingAdjustments: 0,
    justifications: [],
    ...overrides,
  };
}

describe('ratesForMonth', () => {
  const rows = [
    { unitId: UNIT, scheduleId: DAY_SCHEDULE, validFrom: '2026-01', amountCents: 15000 },
    { unitId: UNIT, scheduleId: DAY_SCHEDULE, validFrom: '2026-10', amountCents: 18000 },
    { unitId: UNIT, scheduleId: DAY_SCHEDULE, validFrom: '2026-12', amountCents: 20000 },
    { unitId: OTHER_UNIT, scheduleId: NIGHT_SCHEDULE, validFrom: '2026-01', amountCents: 99900 },
  ];

  it('usa o valor de vigência mais recente que já começou (reajuste na virada do mês)', () => {
    expect(ratesForMonth(rows, UNIT, '2026-09').get(DAY_SCHEDULE)).toBe(15000);
    expect(ratesForMonth(rows, UNIT, '2026-10').get(DAY_SCHEDULE)).toBe(18000);
    expect(ratesForMonth(rows, UNIT, '2026-11').get(DAY_SCHEDULE)).toBe(18000);
    expect(ratesForMonth(rows, UNIT, '2027-01').get(DAY_SCHEDULE)).toBe(20000);
  });

  it('ignora valores de outro posto e de vigência futura', () => {
    expect(ratesForMonth(rows, UNIT, '2026-12').has(NIGHT_SCHEDULE)).toBe(false);
    expect(ratesForMonth(rows, UNIT, '2025-12').size).toBe(0);
  });
});

describe('summarizeShiftPay', () => {
  const names = new Map([
    [DAY_SCHEDULE, '12x36 diurno'],
    [NIGHT_SCHEDULE, '12x36 noturno'],
  ]);
  const justification = {
    type: 'medical_certificate' as const,
    id: entry.id,
    startTime: null,
    endTime: null,
  };

  it('conta plantões trabalhados por escala e multiplica pelo valor', () => {
    const pay = summarizeShiftPay(
      [
        day('2026-10-01', DAY_SCHEDULE, { entries: [entry, entry] }),
        day('2026-10-03', DAY_SCHEDULE, { entries: [entry] }),
        // Falta: turno sem marcação e sem atestado.
        day('2026-10-05', DAY_SCHEDULE),
        day('2026-10-07', DAY_SCHEDULE, { justifications: [justification] }),
        day('2026-10-20', NIGHT_SCHEDULE, { entries: [entry, entry] }),
        // Folga trabalhada não vira plantão.
        day('2026-10-21', NIGHT_SCHEDULE, { entries: [entry, entry] }, false),
      ],
      '2026-10-01',
      '2026-10-31',
      names,
      new Map([[DAY_SCHEDULE, 18000]]),
    );
    expect(pay).toEqual({
      lines: [
        {
          scheduleId: DAY_SCHEDULE,
          schedule: '12x36 diurno',
          rate: 180,
          shifts: 2,
          justifiedShifts: 1,
          amount: 360,
        },
        {
          scheduleId: NIGHT_SCHEDULE,
          schedule: '12x36 noturno',
          rate: null,
          shifts: 1,
          justifiedShifts: 0,
          amount: 0,
        },
      ],
      shifts: 3,
      total: 360,
    });
  });

  it('só conta os dias entre admissão/desligamento (from/to)', () => {
    const pay = summarizeShiftPay(
      [
        day('2026-10-01', DAY_SCHEDULE, { entries: [entry] }),
        day('2026-10-15', DAY_SCHEDULE, { entries: [entry] }),
      ],
      '2026-10-10',
      '2026-10-31',
      names,
      new Map([[DAY_SCHEDULE, 10050]]),
    );
    expect(pay.shifts).toBe(1);
    expect(pay.total).toBe(100.5);
  });
});
