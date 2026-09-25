import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission, ProblemType } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { AuthPrincipal, TokenType } from '../../auth/domain/auth-principal';
import { Public } from '../../auth/http/auth.decorators';
import type { AccessResolver, UserAccess } from '../application/access-resolver.service';
import { EMPTY_SCOPE } from '../domain/data-scope';
import { AnyAuthenticated, type RequestWithAccess, RequirePermission } from './access.decorators';
import { PermissionGuard } from './permission.guard';

class Routes {
  @Public()
  open(): string {
    return 'open';
  }

  undeclared(): string {
    return 'undeclared';
  }

  @RequirePermission('roles:read')
  readRoles(): string {
    return 'readRoles';
  }

  @AnyAuthenticated()
  anyone(): string {
    return 'anyone';
  }

  @AnyAuthenticated({ allowPendingSetup: true })
  mfaSetup(): string {
    return 'mfaSetup';
  }
}

const unitScope = { ...EMPTY_SCOPE, unitIds: ['u1'] };

function access(overrides: Partial<UserAccess> = {}): UserAccess {
  return {
    userId: 'user',
    companyId: 'company',
    isActive: true,
    mfaEnabled: false,
    mfaRequired: false,
    passwordChangeRequired: false,
    permissions: new Map<Permission, typeof unitScope>([['roles:read', unitScope]]),
    ...overrides,
  };
}

function run(
  handler: keyof Routes,
  options: { tokenType?: TokenType; access?: UserAccess | null } = {},
) {
  const principal: AuthPrincipal = {
    userId: 'user',
    companyId: 'company',
    tokenType: options.tokenType ?? 'access',
    tokenId: 'jti',
  };
  const request = { principal, method: 'GET' } as unknown as RequestWithAccess;
  const context = {
    getType: () => 'http',
    getHandler: () => Object.getOwnPropertyDescriptor(Routes.prototype, handler)?.value as unknown,
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const resolver = {
    resolve: () => Promise.resolve(options.access === undefined ? access() : options.access),
  } as unknown as AccessResolver;
  const guard = new PermissionGuard(new Reflector(), resolver);
  // Silencia o log esperado da rota sem requisito declarado.
  Object.assign(guard, { logger: { error: () => undefined } });
  return { result: guard.canActivate(context), request };
}

async function problemOf(promise: Promise<boolean>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProblemException);
  return (error as ProblemException).problem;
}

describe('PermissionGuard', () => {
  it('libera rotas públicas', async () => {
    await expect(run('open').result).resolves.toBe(true);
  });

  it('nega por padrão rotas sem requisito declarado', async () => {
    expect(await problemOf(run('undeclared').result)).toMatchObject({
      status: 403,
      type: ProblemType.Forbidden,
    });
  });

  it('concede a permissão e anexa o escopo com que foi concedida', async () => {
    const { result, request } = run('readRoles');
    await expect(result).resolves.toBe(true);
    expect(request.access).toMatchObject({ permission: 'roles:read', scope: unitScope });
  });

  it('nega sem a permissão', async () => {
    const { result } = run('readRoles', { access: access({ permissions: new Map() }) });
    expect(await problemOf(result)).toMatchObject({ status: 403, type: ProblemType.Forbidden });
  });

  it('usuário inativo ou inexistente recebe 401', async () => {
    expect(
      await problemOf(run('anyone', { access: access({ isActive: false }) }).result),
    ).toMatchObject({
      status: 401,
    });
    expect(await problemOf(run('anyone', { access: null }).result)).toMatchObject({ status: 401 });
  });

  it('com MFA exigido e não ativado, só libera rotas marcadas', async () => {
    const pending = access({ mfaRequired: true, mfaEnabled: false });
    expect(await problemOf(run('readRoles', { access: pending }).result)).toMatchObject({
      status: 403,
      type: ProblemType.MfaSetupRequired,
    });
    expect(await problemOf(run('anyone', { access: pending }).result)).toMatchObject({
      type: ProblemType.MfaSetupRequired,
    });
    await expect(run('mfaSetup', { access: pending }).result).resolves.toBe(true);
  });

  it('com senha temporária, só libera rotas marcadas', async () => {
    const pending = access({ passwordChangeRequired: true });
    expect(await problemOf(run('readRoles', { access: pending }).result)).toMatchObject({
      status: 403,
      type: ProblemType.PasswordChangeRequired,
    });
    await expect(run('mfaSetup', { access: pending }).result).resolves.toBe(true);
  });

  it('tokens de MFA não entram em rotas com permissão', async () => {
    expect(await problemOf(run('readRoles', { tokenType: 'mfa_enrollment' }).result)).toMatchObject(
      {
        status: 403,
      },
    );
    await expect(run('mfaSetup', { tokenType: 'mfa_enrollment' }).result).resolves.toBe(true);
  });
});
