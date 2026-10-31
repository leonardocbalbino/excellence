import { describe, expect, it } from 'vitest';
import { resolveOfflineTime } from './offline';

const now = new Date('2026-09-26T15:00:00.000Z');

describe('resolveOfflineTime', () => {
  it('sem horário offline, o oficial é o do servidor', () => {
    expect(resolveOfflineTime({ offlineRecordedAt: null, source: 'web', now })).toEqual({
      ok: true,
      recordedAt: null,
      offline: false,
    });
  });

  it('aceita o horário do aparelho no app, dentro da janela', () => {
    const result = resolveOfflineTime({
      offlineRecordedAt: '2026-09-26T12:30:00.000Z',
      source: 'mobile',
      now,
    });
    expect(result).toEqual({
      ok: true,
      recordedAt: new Date('2026-09-26T12:30:00.000Z'),
      offline: true,
    });
  });

  it('recusa web, futuro, mais de 72 h e antes do início da ronda', () => {
    const at = (iso: string, source: 'web' | 'mobile' = 'mobile', notBefore?: Date) =>
      resolveOfflineTime({
        offlineRecordedAt: iso,
        source,
        now,
        ...(notBefore ? { notBefore } : {}),
      }).ok;
    expect(at('2026-09-26T12:30:00.000Z', 'web')).toBe(false);
    expect(at('2026-09-26T15:01:00.000Z')).toBe(true); // tolerância de relógio
    expect(at('2026-09-26T15:05:00.000Z')).toBe(false);
    expect(at('2026-09-23T14:59:00.000Z')).toBe(false);
    expect(at('2026-09-26T12:30:00.000Z', 'mobile', new Date('2026-09-26T13:00:00.000Z'))).toBe(
      false,
    );
  });
});
