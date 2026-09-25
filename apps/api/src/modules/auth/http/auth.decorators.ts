import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal, TokenType } from '../domain/auth-principal';

export const IS_PUBLIC = 'auth:isPublic';
export const ACCEPTED_TOKEN_TYPES = 'auth:acceptedTokenTypes';

/** Rota sem autenticação. Por padrão, toda rota exige um token `access`. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Tipos de token aceitos na rota, no lugar do padrão (`access`). */
export const AcceptTokenTypes = (...types: TokenType[]) => SetMetadata(ACCEPTED_TOKEN_TYPES, types);

export type AuthenticatedRequest = Request & { principal?: AuthPrincipal };

/** Injeta o principal autenticado. Só use em rotas protegidas pelo AuthGuard. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const principal = ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new Error('CurrentPrincipal usado em rota sem autenticação');
    return principal;
  },
);
