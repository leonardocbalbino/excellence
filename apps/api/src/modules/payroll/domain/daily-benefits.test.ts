import type { TimesheetDay } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { type DailyAssignment, summarizeDailyBenefits } from './daily-benefits';

const SCHEDULE = '01900000-0000-7000-8000-000000000b01';
const ADJUSTMENT = '01900000-0000-7000-8000-000000000f01';

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

const certificate = {
  type: 'medical_certificate' as const,
  id: '01900000-0000-7000-8000-000000000c01',
  startTime: null,
  endTime: null,
};

function day(date: string, kind: 'worked' | 'absent' | 'certificate' | 'off'): TimesheetDay {
  return {
    date,
    planned: {
      date,
      unassigned: false,
      scheduleId: SCHEDULE,
      shift: kind === 'off' ? null : shift,
      flexibleWeeklyMinutes: null,
      holiday: null,
    },
    entries: kind === 'worked' ? [entry] : [],
    workedMinutes: kind === 'worked' ? 660 : 0,
    incomplete: false,
    pendingAdjustments: 0,
    justifications: kind === 'certificate' ? [certificate] : [],
  };
}

// 01 a 06: trabalhou, faltou, atestado, trabalhou, folga, trabalhou.
const days = [
  day('2026-10-01', 'worked'),
  day('2026-10-02', 'absent'),
  day('2026-10-03', 'certificate'),
  day('2026-10-04', 'worked'),
  day('2026-10-05', 'off'),
  day('2026-10-06', 'worked'),
];

const va: DailyAssignment = {
  kind: 'food',
  calculation: 'per_worked_day',
  startDate: '2026-01-01',
  endDate: null,
  dailyValueCents: 3000,
};
const vt: DailyAssignment = {
  kind: 'transport',
  calculation: 'per_worked_or_justified_day',
  startDate: '2026-01-01',
  endDate: null,
  dailyValueCents: 1000,
};

describe('summarizeDailyBenefits', () => {
  it('conta os dias trabalhados no ponto e multiplica pelo valor diário', () => {
    const result = summarizeDailyBenefits(days, '2026-10-01', '2026-10-31', [va, vt], []);
    expect(result.food).toMatchObject({ days: 3, dailyValue: 30, total: 90, adjustment: null });
    // Regra "ou com atestado": o dia 03 também conta.
    expect(result.transport).toMatchObject({ days: 4, dailyValue: 10, total: 40 });
    expect(result.total).toBe(130);
  });

  it('não conta falta, folga sem marcação nem dias fora do período ou da vigência', () => {
    const result = summarizeDailyBenefits(
      days,
      '2026-10-02',
      '2026-10-05',
      [{ ...va, endDate: '2026-10-03' }],
      [],
    );
    expect(result.food).toMatchObject({ days: 0, dailyValue: 30, total: 0 });
    expect(result.transport).toBeNull();
  });

  it('soma dois benefícios do mesmo tipo no mesmo dia (ônibus + metrô)', () => {
    const metro: DailyAssignment = { ...vt, calculation: 'per_worked_day', dailyValueCents: 850 };
    const result = summarizeDailyBenefits(days, '2026-10-01', '2026-10-31', [vt, metro], []);
    expect(result.transport).toMatchObject({ days: 4, total: 65.5 });
  });

  it('aplica o ajuste do RH: o que não foi informado segue o calculado', () => {
    const result = summarizeDailyBenefits(
      days,
      '2026-10-01',
      '2026-10-31',
      [va],
      [{ id: ADJUSTMENT, kind: 'food', days: 5, dailyValueCents: null, reason: 'Treinamento' }],
    );
    expect(result.food).toEqual({
      days: 5,
      dailyValue: 30,
      total: 150,
      calculated: { days: 3, dailyValue: 30, total: 90 },
      adjustment: { id: ADJUSTMENT, days: 5, dailyValue: null, reason: 'Treinamento' },
    });
    expect(result.total).toBe(150);
  });

  it('o ajuste vale mesmo sem o benefício atribuído (exceção do mês)', () => {
    const result = summarizeDailyBenefits(
      days,
      '2026-10-01',
      '2026-10-31',
      [],
      [{ id: ADJUSTMENT, kind: 'transport', days: 2, dailyValueCents: 1200, reason: 'Cobertura' }],
    );
    expect(result.transport).toMatchObject({ days: 2, dailyValue: 12, total: 24 });
    expect(result.food).toBeNull();
  });
});
