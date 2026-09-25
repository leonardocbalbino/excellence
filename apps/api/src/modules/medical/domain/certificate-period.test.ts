import { describe, expect, it } from 'vitest';
import { minutesToTime, periodDays, periodsOverlap } from './certificate-period';

const days = (startDate: string, endDate: string) => ({
  startDate,
  endDate,
  startMinute: null,
  endMinute: null,
});
const hours = (date: string, startMinute: number, endMinute: number) => ({
  startDate: date,
  endDate: date,
  startMinute,
  endMinute,
});

describe('periodsOverlap', () => {
  it('detecta dias que se cruzam', () => {
    expect(periodsOverlap(days('2026-09-01', '2026-09-03'), days('2026-09-03', '2026-09-05'))).toBe(
      true,
    );
    expect(periodsOverlap(days('2026-09-01', '2026-09-02'), days('2026-09-03', '2026-09-05'))).toBe(
      false,
    );
  });

  it('dia inteiro cobre qualquer declaração de horas do mesmo dia', () => {
    expect(periodsOverlap(days('2026-09-01', '2026-09-01'), hours('2026-09-01', 480, 600))).toBe(
      true,
    );
  });

  it('declarações de horas no mesmo dia só conflitam se as faixas se cruzam', () => {
    expect(periodsOverlap(hours('2026-09-01', 480, 600), hours('2026-09-01', 600, 660))).toBe(
      false,
    );
    expect(periodsOverlap(hours('2026-09-01', 480, 600), hours('2026-09-01', 540, 660))).toBe(true);
  });
});

describe('periodDays', () => {
  it('conta início e fim, inclusive na virada do mês', () => {
    expect(periodDays('2026-09-01', '2026-09-01')).toBe(1);
    expect(periodDays('2026-09-29', '2026-10-02')).toBe(4);
  });
});

describe('minutesToTime', () => {
  it('formata HH:MM', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(605)).toBe('10:05');
  });
});
