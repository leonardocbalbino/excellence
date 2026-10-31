/**
 * Registro feito sem conexão no app mobile: o aparelho guarda o momento da marcação (ou do
 * check-in de ronda) e envia quando a conexão volta. A aceitação do horário do aparelho depende
 * da Portaria MTP 671/2021 (REP-P); os limites abaixo são provisórios (pendência P-026).
 */
export const OFFLINE_MAX_HOURS = 72;
/** Diferença aceita entre o relógio do aparelho e o do servidor, para frente. */
export const OFFLINE_FUTURE_TOLERANCE_MS = 2 * 60_000;

/** Valor de `source` gravado em marcações e check-ins feitos sem conexão. */
export const OFFLINE_SOURCE = 'mobile_offline';

export type OfflineTime =
  { ok: true; recordedAt: Date | null; offline: boolean } | { ok: false; reason: string };

/**
 * Horário oficial do registro. Sem `offlineRecordedAt`, é o do servidor (null: o gravador usa
 * o relógio dele). Com ele, só vale para o app mobile, nunca no futuro, até
 * `OFFLINE_MAX_HOURS` para trás e, quando informado, não antes de `notBefore`.
 */
export function resolveOfflineTime(input: {
  offlineRecordedAt: string | null | undefined;
  source: 'web' | 'mobile';
  now: Date;
  notBefore?: Date;
}): OfflineTime {
  if (!input.offlineRecordedAt) return { ok: true, recordedAt: null, offline: false };
  if (input.source !== 'mobile') {
    return { ok: false, reason: 'Registro sem conexão só é aceito pelo aplicativo.' };
  }
  const at = new Date(input.offlineRecordedAt);
  if (Number.isNaN(at.getTime())) return { ok: false, reason: 'Horário inválido.' };
  if (at.getTime() > input.now.getTime() + OFFLINE_FUTURE_TOLERANCE_MS) {
    return { ok: false, reason: 'O horário do aparelho está no futuro. Ajuste o relógio.' };
  }
  if (input.now.getTime() - at.getTime() > OFFLINE_MAX_HOURS * 3_600_000) {
    return {
      ok: false,
      reason: `Registro sem conexão com mais de ${String(OFFLINE_MAX_HOURS)} h: fale com o RH para incluir por ajuste.`,
    };
  }
  if (input.notBefore && at.getTime() < input.notBefore.getTime()) {
    return { ok: false, reason: 'O horário é anterior ao início da ronda.' };
  }
  return { ok: true, recordedAt: at, offline: true };
}
