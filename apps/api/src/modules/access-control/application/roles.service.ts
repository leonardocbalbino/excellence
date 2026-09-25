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
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
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
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

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
    return this.db.client.$transaction(async (tx) => {
      const role = toRole(
        await tx.role.create({
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
        }),
      );
      await this.audit.record(
        {
          action: 'role.created',
          resourceType: 'role',
          resourceId: role.id,
          metadata: snapshot(role),
        },
        tx,
      );
      return role;
    });
  }

  async update(id: string, input: RoleInput, grant: AccessGrant): Promise<Role> {
    assertCompanyWide(grant);
    return this.db.client.$transaction(async (tx) => {
      const currentRow = await tx.role.findUnique({ where: { id }, select: ROLE_SELECT });
      if (!currentRow) throw new NotFoundException('Perfil não encontrado.');
      const before = toRole(currentRow);

      // Só as permissões acrescentadas precisam estar em poder de quem edita.
      const existing = new Set<string>(before.permissions);
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
      const after = toRole(row);
      await this.audit.record(
        {
          action: 'role.updated',
          resourceType: 'role',
          resourceId: id,
          metadata: { before: snapshot(before), after: snapshot(after) },
        },
        tx,
      );
      return after;
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
    await this.db.client.$transaction(async (tx) => {
      const deleted = toRole(await tx.role.delete({ where: { id }, select: ROLE_SELECT }));
      await this.audit.record(
        {
          action: 'role.deleted',
          resourceType: 'role',
          resourceId: id,
          metadata: snapshot(deleted),
        },
        tx,
      );
    });
  }
}

/** Estado do perfil registrado na auditoria (antes/depois). */
function snapshot(role: Role) {
  const { name, description, requiresMfa, permissions, scopes } = role;
  return toAuditJson({ name, description, requiresMfa, permissions, scopes });
}
