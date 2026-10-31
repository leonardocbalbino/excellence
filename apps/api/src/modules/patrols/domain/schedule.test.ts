import { describe, expect, it } from 'vitest';
import { lateMinutes, pickSlot, slotsOn, slotStatus, weekdayOf } from './schedule';

const TZ = 'America/Sao_Paulo';
const route = { startMinutes: [19 * 60, 8 * 60], weekdays: [1, 2, 3, 4, 5], expectedMinutes: 40 };
const at = (iso: string) => new Date(iso);

describe('slotsOn', () => {
  it('horários da rota nos dias previstos, em ordem e no fuso da unidade', () => {
    expect(weekdayOf('2026-09-28')).toBe(1);
    expect(slotsOn(route, '2026-09-28', TZ).map((d) => d.toISOString())).toEqual([
      '2026-09-28T11:00:00.000Z',
      '2026-09-28T22:00:00.000Z',
    ]);
    // Sábado não está nos dias da rota.
    expect(slotsOn(route, '2026-09-26', TZ)).toEqual([]);
  });
});

describe('pickSlot', () => {
  const slots = slotsOn(route, '2026-09-28', TZ);

  it('aceita de 30 min antes até o fim do tempo previsto', () => {
    expect(pickSlot(slots, new Set(), at('2026-09-28T10:30:00Z'), 40)).toEqual(slots[0]);
    expect(pickSlot(slots, new Set(), at('2026-09-28T11:40:00Z'), 40)).toEqual(slots[0]);
    expect(pickSlot(slots, new Set(), at('2026-09-28T10:29:00Z'), 40)).toBeNull();
    expect(pickSlot(slots, new Set(), at('2026-09-28T11:41:00Z'), 40)).toBeNull();
  });

  it('horário já cumprido por outra ronda não é reutilizado', () => {
    const taken = new Set([slots[0]?.getTime() ?? 0]);
    expect(pickSlot(slots, taken, at('2026-09-28T11:10:00Z'), 40)).toBeNull();
  });
});

describe('slotStatus e atraso', () => {
  const slot = at('2026-09-28T22:00:00Z');

  it('sem ronda: previsto até o fim do tempo, depois perdido', () => {
    expect(slotStatus(slot, 40, null, at('2026-09-28T22:40:00Z'))).toBe('upcoming');
    expect(slotStatus(slot, 40, null, at('2026-09-28T22:41:00Z'))).toBe('missed');
  });

  it('com ronda: em andamento ou feita', () => {
    expect(slotStatus(slot, 40, { status: 'in_progress' }, at('2026-09-29T02:00:00Z'))).toBe(
      'in_progress',
    );
    expect(slotStatus(slot, 40, { status: 'incomplete' }, at('2026-09-28T21:00:00Z'))).toBe('done');
  });

  it('atraso conta até agora ou até o encerramento', () => {
    const end = at('2026-09-28T22:40:00Z');
    expect(lateMinutes(end, null, at('2026-09-28T22:39:00Z'))).toBe(0);
    expect(lateMinutes(end, null, at('2026-09-28T22:52:30Z'))).toBe(12);
    expect(lateMinutes(end, at('2026-09-28T22:45:00Z'), at('2026-09-29T09:00:00Z'))).toBe(5);
  });
});
