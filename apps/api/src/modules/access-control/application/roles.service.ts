import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  isPermission,
  type Permission,
  ProblemType,
  type Role,
  type roleInputSchema,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { fromRoleScope, toRoleScope } from '../domain/data-scope';
import type { AccessGrant } from '../http/access.decorators';
import { assertAdministratorRemains, assertCanGrant, assertCompanyWide } from './access-rules';

type RoleInput = z.output<typeof roleInputSchema>;

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  requiresMfa: true,
  permissions: { select: { permissionKey: true }, orderBy: { permissionKey: 'asc' } },
  scopes: { select: { type: true, unitId: true, departmentId: true } },
  _count: { select: { userRoles: true } },
} as const;

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  requiresMfa: boolean;
  permissions: { permissionKey: string }[];
  scopes: {
    type: Role['scopes'][number]['type'];
    unitId: string | null;
    departmentId: string | null;
  }[];
  _count: { userRoles: number };
}

function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    requiresMfa: row.requiresMfa,
    permissions: row.permissions.map((p) => p.permissionKey).filter(isPermission),
    scopes: row.scopes.map(toRoleScope),
    userCount: row._count.userRoles,
  };
}

@Injectable()
export class RolesService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(): Promise<Role[]> {
    const rows = await this.db.client.role.findMany({
      select: ROLE_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toRole);
  }

  async get(id: string): Promise<Role> {
    const row = await this.db.client.role.findUnique({ where: { id }, select: ROLE_SELECT });
    if (!row) throw new NotFoundException('Perfil não encontrado.');
    return toRole(row);
  }

  async create(input: RoleInput, grant: AccessGrant): Promise<Role> {
    assertCompanyWide(grant);
    assertCanGrant(grant, input.permissions);
    const row = await this.db.client.role.create({
      data: {
        companyId: grant.companyId,
        name: input.name,
        description: input.description,
        requiresMfa: input.requiresMfa,
        permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
        // company_id dos filhos vem da FK composta (role_id, company_id).
        scopes: { create: input.scopes.map(fromRoleScope) },
      },
      select: ROLE_SELECT,
    });
    return toRole(row);
  }

  async update(id: string, input: RoleInput, grant: AccessGrant): Promise<Role> {
    assertCompanyWide(grant);
    return this.db.client.$transaction(async (tx) => {
      const current = await tx.role.findUnique({
        where: { id },
        select: { permissions: { select: { permissionKey: true } } },
      });
      if (!current) throw new NotFoundException('Perfil não encontrado.');

      // Só as permissões acrescentadas precisam estar em poder de quem edita.
      const existing = new Set(current.permissions.map((p) => p.permissionKey));
      assertCanGrant(
        grant,
        input.permissions.filter((p: Permission) => !existing.has(p)),
      );

      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.roleScope.deleteMany({ where: { roleId: id } });
      const row = await tx.role.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          requiresMfa: input.requiresMfa,
          permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
          // company_id dos filhos vem da FK composta (role_id, company_id).
          scopes: { create: input.scopes.map(fromRoleScope) },
        },
        select: ROLE_SELECT,
      });
      await assertAdministratorRemains(tx);
      return toRole(row);
    });
  }

  async remove(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const role = await this.db.client.role.findUnique({
      where: { id },
      select: { isSystem: true, _count: { select: { userRoles: true } } },
    });
    if (!role) throw new NotFoundException('Perfil não encontrado.');
    if (role.isSystem) {
      throw new ProblemException({
        type: ProblemType.SystemRole,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'Perfis padrão podem ser editados, mas não excluídos.',
      });
    }
    if (role._count.userRoles > 0) {
      throw new ProblemException({
        type: ProblemType.RoleInUse,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'Remova o perfil dos usuários antes de excluí-lo.',
      });
    }
    await this.db.client.role.delete({ where: { id } });
  }
}
