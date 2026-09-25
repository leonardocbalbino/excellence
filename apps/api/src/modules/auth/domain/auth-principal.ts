import type { AuthClient } from '@excellence/shared';

/**
 * Tipos de token emitidos pela API:
 * - `access`: sessão completa, aceito por padrão em todas as rotas autenticadas;
 * - `mfa_challenge`: senha correta, falta o segundo fator (só `/auth/mfa/verify`);
 * - `mfa_enrollment`: senha correta e o perfil exige MFA ainda não configurado
 *   (só `/auth/mfa/setup` e `/auth/mfa/activate`).
 */
export type TokenType = 'access' | 'mfa_challenge' | 'mfa_enrollment';

/** Quem está chamando, extraído de um token válido. */
export interface AuthPrincipal {
  userId: string;
  companyId: string;
  tokenType: TokenType;
  /** ID único do token (usado para limitar tentativas de MFA). */
  tokenId: string;
  /** Família de refresh token da sessão; só em tokens `access`. */
  sessionId?: string;
  /** Cliente que iniciou o login; só em tokens de MFA. */
  client?: AuthClient;
}
