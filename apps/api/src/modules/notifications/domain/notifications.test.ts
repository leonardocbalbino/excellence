import type { PlannedDay } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { chunk, deadTokens, toExpoMessages } from './expo-push';
import { clockReminder, patrolReminder } from './reminders';

const TZ = 'America/Fortaleza'; // UTC-3, sem horário de verão
/** Instante a partir do horário local de Fortaleza. */
const at = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);

function planned(overrides: Partial<NonNullable<PlannedDay['shift']>> = {}): PlannedDay {
  return {
    date: '2026-10-24',
    unassigned: false,
    scheduleId: '01900000-0000-7000-8000-000000000b01',
    shift: {
      id: '01900000-0000-7000-8000-000000000901',
      name: '12h diurno',
      start: '07:00',
      end: '19:00',
      crossesMidnight: false,
      breakMinutes: 60,
      workMinutes: 660,
      ...overrides,
    },
    flexibleWeeklyMinutes: null,
    holiday: null,
  };
}

describe('patrolReminder', () => {
  const slot = at('2026-10-24', '22:00');

  it('avisa 10 min antes e, se ninguém iniciou, depois de 15 min', () => {
    expect(patrolReminder(slot, false, at('2026-10-24', '21:49'))).toBeNull();
    expect(patrolReminder(slot, false, at('2026-10-24', '21:50'))).toBe('patrol_upcoming');
    expect(patrolReminder(slot, false, at('2026-10-24', '22:05'))).toBeNull();
    expect(patrolReminder(slot, false, at('2026-10-24', '22:15'))).toBe('patrol_late');
    expect(patrolReminder(slot, false, at('2026-10-24', '22:45'))).toBeNull();
  });

  it('ronda já iniciada não gera lembrete', () => {
    expect(patrolReminder(slot, true, at('2026-10-24', '22:20'))).toBeNull();
  });
});

describe('clockReminder', () => {
  it('lembra a entrada em volta do início do turno, só sem marcação', () => {
    expect(clockReminder(planned(), 0, false, TZ, at('2026-10-24', '06:49'))).toBeNull();
    expect(clockReminder(planned(), 0, false, TZ, at('2026-10-24', '06:50'))).toEqual({
      kind: 'clock_in_reminder',
      time: '07:00',
    });
    expect(clockReminder(planned(), 1, false, TZ, at('2026-10-24', '06:55'))).toBeNull();
    expect(clockReminder(planned(), 0, false, TZ, at('2026-10-24', '07:30'))).toBeNull();
  });

  it('lembra a saída depois do fim, com marcação em aberto', () => {
    expect(clockReminder(planned(), 1, false, TZ, at('2026-10-24', '19:10'))).toEqual({
      kind: 'clock_out_reminder',
      time: '19:00',
    });
    expect(clockReminder(planned(), 2, false, TZ, at('2026-10-24', '19:10'))).toBeNull();
  });

  it('turno noturno termina no dia seguinte', () => {
    const night = planned({ start: '19:00', end: '07:00', crossesMidnight: true });
    expect(clockReminder(night, 1, false, TZ, at('2026-10-25', '07:05'))?.kind).toBe(
      'clock_out_reminder',
    );
  });

  it('feriado, folga ou atestado não geram lembrete', () => {
    const holiday = {
      ...planned(),
      holiday: { id: planned().scheduleId ?? '', name: 'X', scope: 'national' as const },
    };
    expect(clockReminder(holiday, 0, false, TZ, at('2026-10-24', '06:55'))).toBeNull();
    expect(
      clockReminder({ ...planned(), shift: null }, 0, false, TZ, at('2026-10-24', '06:55')),
    ).toBeNull();
    expect(clockReminder(planned(), 0, true, TZ, at('2026-10-24', '06:55'))).toBeNull();
  });
});

describe('expo push', () => {
  const data = { kind: 'announcement' as const, url: '/comunicados' };

  it('monta uma mensagem por aparelho e separa em lotes', () => {
    const messages = toExpoMessages(['ExponentPushToken[a]', 'ExponentPushToken[b]'], {
      title: 'Comunicado',
      body: 'Novo',
      data,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ to: 'ExponentPushToken[a]', sound: 'default' });
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('aponta os aparelhos que não existem mais', () => {
    const messages = toExpoMessages(['ExponentPushToken[a]', 'ExponentPushToken[b]'], {
      title: 't',
      body: 'b',
      data,
    });
    expect(
      deadTokens(messages, [
        { status: 'ok', id: '1' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ]),
    ).toEqual(['ExponentPushToken[b]']);
  });
});
