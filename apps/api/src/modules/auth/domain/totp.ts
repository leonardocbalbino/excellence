import { randomInt } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';

const PERIOD_SECONDS = 30;
const DIGITS = 6;
/** Aceita um passo antes e um depois (±30 s) por diferença de relógio do celular. */
const WINDOW = 1;

export interface TotpIdentity {
  issuer: string;
  label: string;
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function totpFor(secret: string, identity?: TotpIdentity): TOTP {
  return new TOTP({
    issuer: identity?.issuer,
    label: identity?.label,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: Secret.fromBase32(secret),
  });
}

export function totpUri(secret: string, identity: TotpIdentity): string {
  return totpFor(secret, identity).toString();
}

/** Código válido agora (usado em testes e na geração de exemplos). */
export function generateTotpCode(secret: string, timestampMs: number): string {
  return totpFor(secret).generate({ timestamp: timestampMs });
}

/**
 * Valida um código TOTP e devolve o passo de tempo aceito, ou `null`.
 * Rejeita passos iguais ou anteriores a `lastUsedStep`: um código já usado (ou mais
 * antigo que o último usado) não vale de novo, mesmo dentro da janela.
 */
export function verifyTotp(
  secret: string,
  code: string,
  timestampMs: number,
  lastUsedStep: bigint | null,
): bigint | null {
  const delta = totpFor(secret).validate({ token: code, timestamp: timestampMs, window: WINDOW });
  if (delta === null) return null;
  const step = BigInt(Math.floor(timestampMs / 1000 / PERIOD_SECONDS) + delta);
  if (lastUsedStep !== null && step <= lastUsedStep) return null;
  return step;
}

// Sem caracteres ambíguos (0/O, 1/I/L).
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const RECOVERY_CODE_COUNT = 10;

/** Código de recuperação no formato XXXXX-XXXXX (~49 bits de entropia). */
export function generateRecoveryCode(): string {
  const chars = Array.from(
    { length: 10 },
    () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
  );
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

export function isRecoveryCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(code);
}
