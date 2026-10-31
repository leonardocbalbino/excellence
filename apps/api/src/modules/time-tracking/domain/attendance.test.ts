import type { PlannedDay } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { attendanceStatus } from './attendance';

const shift = {
  id: '01900000-0000-7000-8000-000000000901',
  name: 'Comercial',
  start: '08:00',
  end: '17:00',
  crossesMidnight: false,
  breakMinutes: 60,
  workMinutes: 480,
} satisfies NonNullable<PlannedDay['shift']>;
const holiday = {
  id: '01900000-0000-7000-8000-000000000902',
  name: 'Natal',
  scope: 'national' as const,
};

describe('attendanceStatus', () => {
  it('marcações ímpares: em jornada; pares: encerrou', () => {
    expect(attendanceStatus(1, { shift, holiday: null }, false)).toBe('present');
    expect(attendanceStatus(3, { shift: null, holiday: null }, false)).toBe('present');
    expect(attendanceStatus(2, { shift, holiday: null }, false)).toBe('finished');
    // Marcou em dia de folga: conta como jornada normal.
    expect(attendanceStatus(4, { shift: null, holiday }, true)).toBe('finished');
  });

  it('sem marcações: atestado, sem registro no turno ou folga', () => {
    expect(attendanceStatus(0, { shift, holiday: null }, true)).toBe('justified');
    expect(attendanceStatus(0, { shift, holiday: null }, false)).toBe('no_entries');
    expect(attendanceStatus(0, { shift, holiday }, false)).toBe('off');
    expect(attendanceStatus(0, { shift: null, holiday: null }, false)).toBe('off');
  });
});
