import { HttpStatus } from '@nestjs/common';
import { type Permission, ProblemType } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { TenantClient } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../http/access.decorators';

type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

/**
 * Gestão de perfis e atribuições só com a permissão concedida em escopo de empresa: quem
 * enxerga só uma unidade não pode criar perfis que enxergam a empresa toda.
 */
export function assertCompanyWide(grant: AccessGrant): void {
  if (!grant.scope?.companyWide) {
    throw new ProblemException({
      type: ProblemType.Forbidden,
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      detail: 'Esta operação exige a permissão com escopo de toda a empresa.',
    });
  }
}

/** Ninguém concede uma permissão que não tem (anti-escalada de privilégio). */
export function assertCanGrant(grant: AccessGrant, permissions: Iterable<Permission>): void {
  const held = grant.access?.permissions;
  const missing = [...permissions].filter((permission) => !held?.has(permission));
  if (missing.length > 0) {
    throw new ProblemException({
      type: ProblemType.PrivilegeEscalation,
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      detail: `Você não pode conceder permissões que não possui: ${missing.join(', ')}.`,
    });
  }
}

/**
 * Garante que a empresa continua com ao menos um usuário ativo capaz de administrar
 * perfis e atribuições (roles:manage e users:manage em escopo de empresa). Chamada dentro da
 * transação, depois da mudança: se falhar, tudo é desfeito.
 */
export async function assertAdministratorRemains(tx: Tx): Promise<void> {
  const holds = (permissionKey: Permission) => ({
    userRoles: {
      some: {
        role: {
          permissions: { some: { permissionKey } },
          scopes: { some: { type: 'company' as const } },
        },
      },
    },
  });
  const administrators = await tx.user.count({
    where: { isActive: true, AND: [holds('roles:manage'), holds('users:manage')] },
  });
  if (administrators === 0) {
    throw new ProblemException({
      type: ProblemType.LastAdministrator,
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: 'A alteração deixaria a empresa sem nenhum administrador ativo.',
    });
  }
}
