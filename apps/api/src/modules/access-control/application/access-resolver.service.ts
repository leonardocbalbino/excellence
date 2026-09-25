import { Injectable } from '@nestjs/common';
import { isPermission, type Permission, type RoleScope } from '@excellence/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { type DataScope, mergeScopes, toRoleScope } from '../domain/data-scope';

/** Acesso efetivo de um usuário: permissões (cada uma com seu escopo) e estado de MFA. */
export interface UserAccess {
  userId: string;
  companyId: string;
  isActive: boolean;
  mfaEnabled: boolean;
  /** Algum perfil do usuário exige MFA. */
  mfaRequired: boolean;
  /** Senha temporária ainda não trocada. */
  passwordChangeRequired: boolean;
  permissions: ReadonlyMap<Permission, DataScope>;
}

/**
 * Calcula o acesso do usuário a partir dos perfis gravados. O escopo de uma permissão é a
 * união dos escopos dos perfis que a concedem: um escopo não "vaza" para permissões que
 * vêm de outro perfil.
 */
@Injectable()
export class AccessResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(userId: string, companyId: string): Promise<UserAccess | null> {
    // Roda antes de existir contexto de requisição: filtra a empresa explicitamente.
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: {
        isActive: true,
        mfaEnabled: true,
        mustChangePassword: true,
        userRoles: {
          select: {
            role: {
              select: {
                requiresMfa: true,
                permissions: { select: { permissionKey: true } },
                scopes: { select: { type: true, unitId: true, departmentId: true } },
              },
            },
          },
        },
      },
    });
    if (!user) return null;

    const scopesByPermission = new Map<Permission, RoleScope[]>();
    let mfaRequired = false;
    for (const { role } of user.userRoles) {
      mfaRequired ||= role.requiresMfa;
      const scopes = role.scopes.map(toRoleScope);
      for (const { permissionKey } of role.permissions) {
        if (!isPermission(permissionKey)) continue;
        scopesByPermission.set(permissionKey, [
          ...(scopesByPermission.get(permissionKey) ?? []),
          ...scopes,
        ]);
      }
    }

    const permissions = new Map<Permission, DataScope>();
    for (const [permission, scopes] of scopesByPermission)
      permissions.set(permission, mergeScopes(scopes));

    return {
      userId,
      companyId,
      isActive: user.isActive,
      mfaEnabled: user.mfaEnabled,
      mfaRequired,
      passwordChangeRequired: user.mustChangePassword,
      permissions,
    };
  }
}
