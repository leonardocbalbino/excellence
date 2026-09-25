import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@excellence/shared';
import type { Request } from 'express';
import type { UserAccess } from '../application/access-resolver.service';
import type { DataScope } from '../domain/data-scope';

export const ACCESS_REQUIREMENT = 'access:requirement';

export type AccessRequirement =
  | { kind: 'permission'; permission: Permission }
  | { kind: 'authenticated'; allowPendingSetup: boolean };

/**
 * Exige a permissão na rota. O escopo com que ela foi concedida fica disponível em
 * `@Access()`, para o serviço filtrar os dados.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(ACCESS_REQUIREMENT, { kind: 'permission', permission } satisfies AccessRequirement);

/**
 * Rota para qualquer usuário autenticado, sem permissão específica (ex.: dados da própria
 * sessão). `allowPendingSetup` libera a rota para quem ainda tem pendência de acesso: MFA
 * exigido pelo perfil e não cadastrado, ou senha temporária a trocar (ex.: as próprias rotas
 * de cadastro do MFA e de troca de senha).
 */
export const AnyAuthenticated = (options: { allowPendingSetup?: boolean } = {}) =>
  SetMetadata(ACCESS_REQUIREMENT, {
    kind: 'authenticated',
    allowPendingSetup: options.allowPendingSetup ?? false,
  } satisfies AccessRequirement);

/** Resultado da checagem de acesso, anexado à requisição pelo PermissionGuard. */
export interface AccessGrant {
  userId: string;
  companyId: string;
  /** Permissão verificada na rota (ausente em rotas `@AnyAuthenticated`). */
  permission?: Permission;
  /** Escopo com que a permissão da rota foi concedida. */
  scope?: DataScope;
  /** Acesso completo, para checagens adicionais no serviço. */
  access?: UserAccess;
}

export type RequestWithAccess = Request & { access?: AccessGrant };

export const Access = createParamDecorator((_data: unknown, ctx: ExecutionContext): AccessGrant => {
  const grant = ctx.switchToHttp().getRequest<RequestWithAccess>().access;
  if (!grant) throw new Error('Access usado em rota sem checagem de acesso');
  return grant;
});
