import { describe, expect, it } from 'vitest';
import {
  addMinutesToTime,
  clockBlock,
  expectedBreakEnd,
  nextPunch,
  punchLabel,
} from './clock-day.js';

const shift = {
  id: '01900000-0000-7000-8000-000000000001',
  name: 'Diurno',
  start: '07:00',
  end: '19:00',
  crossesMidnight: false,
  breakMinutes: 60,
  workMinutes: 660,
};
const workDay = { unassigned: false, shift, flexibleWeeklyMinutes: null };
const dayOff = { unassigned: false, shift: null, flexibleWeeklyMinutes: null };

describe('sequência das marcações', () => {
  it('com almoço: entrada, saída para almoço, retorno e saída', () => {
    expect([0, 1, 2, 3, 4].map((n) => nextPunch(true, n))).toEqual([
      'entry',
      'break_start',
      'break_end',
      'exit',
      null,
    ]);
  });

  it('sem almoço: só entrada e saída', () => {
    expect([0, 1, 2].map((n) => nextPunch(false, n))).toEqual(['entry', 'exit', null]);
  });

  it('marcação além da sequência aparece numerada', () => {
    expect(punchLabel(false, 1)).toBe('Saída');
    expect(punchLabel(false, 2)).toBe('Marcação 3');
  });
});

describe('clockBlock', () => {
  const base = { breakPunches: false, blockOffDay: true };

  it('recusa abrir a jornada na folga', () => {
    expect(clockBlock({ ...base, planned: dayOff, count: 0 })).toBe('day_off');
  });

  it('com a jornada aberta, a saída passa mesmo na folga (turno da véspera, ajuste)', () => {
    expect(clockBlock({ ...base, planned: dayOff, count: 1 })).toBeNull();
  });

  it('folga liberada pela empresa', () => {
    expect(clockBlock({ ...base, blockOffDay: false, planned: dayOff, count: 0 })).toBeNull();
  });

  it('sem escala vinculada ou com escala flexível não é folga', () => {
    expect(clockBlock({ ...base, planned: { ...dayOff, unassigned: true }, count: 0 })).toBeNull();
    expect(
      clockBlock({ ...base, planned: { ...dayOff, flexibleWeeklyMinutes: 2640 }, count: 0 }),
    ).toBeNull();
  });

  it('dia completo: 2 marcações sem almoço, 4 com almoço', () => {
    expect(clockBlock({ ...base, planned: workDay, count: 2 })).toBe('day_complete');
    expect(clockBlock({ ...base, breakPunches: true, planned: workDay, count: 2 })).toBeNull();
    expect(clockBlock({ ...base, breakPunches: true, planned: workDay, count: 4 })).toBe(
      'day_complete',
    );
  });

  it('número ímpar além da sequência (inclusão por ajuste) ainda deixa fechar a jornada', () => {
    expect(clockBlock({ ...base, planned: workDay, count: 3 })).toBeNull();
  });
});

describe('horários previstos', () => {
  it('retorno do almoço = saída para almoço + intervalo do turno', () => {
    expect(
      expectedBreakEnd({ breakPunches: true, planned: { shift }, breakStartTime: '12:10' }),
    ).toBe('13:10');
    expect(
      expectedBreakEnd({ breakPunches: false, planned: { shift }, breakStartTime: '12:10' }),
    ).toBeNull();
  });

  it('soma minutos dando a volta na meia-noite', () => {
    expect(addMinutesToTime('23:30', 60)).toBe('00:30');
  });
});
