import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemType } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { AuthPrincipal, TokenType } from '../domain/auth-principal';
import { InvalidTokenError, type TokenService } from '../infrastructure/token.service';
import { AcceptTokenTypes, type AuthenticatedRequest, Public } from './auth.decorators';
import { AuthGuard } from './auth.guard';

class Routes {
  @Public()
  open(): string {
    return 'open';
  }

  protected(): string {
    return 'protected';
  }

  @AcceptTokenTypes('mfa_challenge')
  mfaOnly(): string {
    return 'mfaOnly';
  }
}

function principal(tokenType: TokenType): AuthPrincipal {
  return { userId: 'u', companyId: 'c', tokenType, tokenId: 'j' };
}

const tokens = {
  verify: (token: string) => {
    if (token === 'access-token') return Promise.resolve(principal('access'));
    if (token === 'mfa-token') return Promise.resolve(principal('mfa_challenge'));
    return Promise.reject(new InvalidTokenError('bad'));
  },
} as unknown as TokenService;

function run(handler: keyof Routes, authorization?: string) {
  const request = { headers: authorization ? { authorization } : {} } as AuthenticatedRequest;
  const context = {
    getType: () => 'http',
    getHandler: () => Object.getOwnPropertyDescriptor(Routes.prototype, handler)?.value as unknown,
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const guard = new AuthGuard(new Reflector(), tokens);
  return { result: guard.canActivate(context), request };
}

async function expectUnauthenticated(promise: Promise<boolean>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProblemException);
  expect((error as ProblemException).problem).toMatchObject({
    status: 401,
    type: ProblemType.Unauthenticated,
  });
  expect((error as ProblemException).headers).toEqual({ 'WWW-Authenticate': 'Bearer' });
}

describe('AuthGuard', () => {
  it('libera rota pública sem token', async () => {
    await expect(run('open').result).resolves.toBe(true);
  });

  it('exige token em rota protegida', async () => {
    await expectUnauthenticated(run('protected').result);
    await expectUnauthenticated(run('protected', 'Basic abc').result);
  });

  it('rejeita token inválido', async () => {
    await expectUnauthenticated(run('protected', 'Bearer lixo').result);
  });

  it('aceita token de acesso e anexa o principal', async () => {
    const { result, request } = run('protected', 'Bearer access-token');
    await expect(result).resolves.toBe(true);
    expect(request.principal?.tokenType).toBe('access');
  });

  it('por padrão recusa tokens de MFA', async () => {
    await expectUnauthenticated(run('protected', 'Bearer mfa-token').result);
  });

  it('respeita @AcceptTokenTypes', async () => {
    await expect(run('mfaOnly', 'bearer mfa-token').result).resolves.toBe(true);
    await expectUnauthenticated(run('mfaOnly', 'Bearer access-token').result);
  });
});
