import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token opaco aleatório (256 bits) em base64url. */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * SHA-256 em hex. Serve para tokens de alta entropia (refresh, recuperação), em que um
 * hash lento não acrescenta segurança e atrapalharia a busca por índice.
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
