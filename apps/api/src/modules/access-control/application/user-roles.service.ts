import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { isPermission, type UserWithRoles } from '@excellence/shared';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../http/access.decorators';
import { assertAdministratorRemains, assertCanGrant, assertCompanyWide } from './access-rules';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  mfaEnabled: true,
  userRoles: { select: { role: { select: { id: true, name: true } } } },
} as const;

function toUser(row: {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mfaEnabled: boolean;
  userRoles: { role: { id: string; name: string } }[];
}): UserWithRoles {
  const { userRoles, ...user } = row;
  return {
    ...user,
    roles: userRoles.map((ur) => ur.role).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Atribuição de perfis a usuários. A listagem ainda é da empresa toda: o filtro por
 * unidade e departamento chega quando usuários forem ligados a funcionários (etapa 1A.1).
 */
@Injectable()
export class UserRolesService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(): Promise<UserWithRoles[]> {
    const rows = await this.db.client.user.findMany({
      select: USER_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toUser);
  }

  async assign(userId: string, roleIds: string[], grant: AccessGrant): Promise<UserWithRoles> {
    assertCompanyWide(grant);
    return this.db.client.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { userRoles: { select: { roleId: true } } },
      });
      if (!user) throw new NotFoundException('Usuário não encontrado.');

      const roles = await tx.role.findMany({
        where: { id: { in: roleIds } },
        select: { id: true, permissions: { select: { permissionKey: true } } },
      });
      if (roles.length !== roleIds.length) {
        throw new UnprocessableEntityException('Um ou mais perfis não existem nesta empresa.');
      }

      // Só os perfis novos precisam caber nas permissões de quem atribui.
      const current = new Set(user.userRoles.map((ur) => ur.roleId));
      const added = roles.filter((role) => !current.has(role.id));
      assertCanGrant(
        grant,
        added.flatMap((role) => role.permissions.map((p) => p.permissionKey).filter(isPermission)),
      );

      await tx.userRole.deleteMany({ where: { userId, roleId: { notIn: roleIds } } });
      await tx.userRole.createMany({
        data: added.map((role) => ({
          companyId: grant.companyId,
          userId,
          roleId: role.id,
          grantedBy: grant.userId,
        })),
      });
      await assertAdministratorRemains(tx);

      return toUser(
        await tx.user.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT }),
      );
    });
  }
}
