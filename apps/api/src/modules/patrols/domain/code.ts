import { PATROL_CODE_PREFIX } from '@excellence/shared';
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Token do QR: 128 bits aleatórios, em base64url. */
export function newCodeToken(): string {
  return randomBytes(16).toString('base64url');
}

export function formatCode(pointId: string, token: string): string {
  return `${PATROL_CODE_PREFIX}.${pointId}.${token}`;
}

/** Compara em tempo constante (não revela quantos caracteres batem). */
export function tokensMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
