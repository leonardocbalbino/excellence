import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemType } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { TokenType } from '../domain/auth-principal';
import { InvalidTokenError, TokenService } from '../infrastructure/token.service';
import { ACCEPTED_TOKEN_TYPES, type AuthenticatedRequest, IS_PUBLIC } from './auth.decorators';

const DEFAULT_TOKEN_TYPES: readonly TokenType[] = ['access'];

function unauthenticated(detail: string): ProblemException {
  return new ProblemException(
    {
      type: ProblemType.Unauthenticated,
      title: 'Unauthorized',
      status: HttpStatus.UNAUTHORIZED,
      detail,
    },
    { 'WWW-Authenticate': 'Bearer' },
  );
}

/**
 * Guard global: toda rota exige `Authorization: Bearer <token>` válido, salvo `@Public()`.
 * Só autentica; permissão e escopo ficam com o guard de RBAC (etapa 0.4).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw unauthenticated('Informe o token de acesso.');
    }

    let principal;
    try {
      principal = await this.tokens.verify(token);
    } catch (error) {
      if (error instanceof InvalidTokenError) throw unauthenticated('Token inválido ou expirado.');
      throw error;
    }

    const accepted =
      this.reflector.getAllAndOverride<TokenType[] | undefined>(ACCEPTED_TOKEN_TYPES, targets) ??
      DEFAULT_TOKEN_TYPES;
    if (!accepted.includes(principal.tokenType)) {
      throw unauthenticated('Este token não é válido para esta operação.');
    }

    request.principal = principal;
    return true;
  }
}
