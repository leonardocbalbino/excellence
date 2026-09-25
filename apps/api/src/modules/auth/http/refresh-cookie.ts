import type { CookieOptions, Request, Response } from 'express';
import { API_PREFIX } from '../../../api-prefix';

export const REFRESH_COOKIE = 'excellence_rt';

/**
 * Cookie do refresh token no web: httpOnly (inacessível a JS), SameSite=Strict (não vai em
 * requisições de outros sites) e restrito às rotas de autenticação.
 */
function options(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: `/${API_PREFIX}/auth` };
}

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE, token, { ...options(secure), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, options(secure));
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
