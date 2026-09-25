import type { Permission, RoleScope } from '@excellence/shared';
import { authenticatedResponseSchema } from '@excellence/shared';
import type request from 'supertest';
import type { PrismaClient } from '../../../src/generated/prisma/client';
import { fromRoleScope } from '../../../src/modules/access-control/domain/data-scope';
import { TEST_PASSWORD } from './db';

type Http = () => ReturnType<typeof request>;

let sequence = 0;

/** Cria um perfil direto no banco (fora da API), para montar cenários de acesso. */
export async function createRole(
  prisma: PrismaClient,
  companyId: string,
  options: {
    permissions: Permission[];
    scopes?: RoleScope[];
    requiresMfa?: boolean;
    isSystem?: boolean;
    name?: string;
  },
) {
  sequence += 1;
  return prisma.role.create({
    data: {
      companyId,
      name: options.name ?? `Perfil de teste ${sequence}`,
      requiresMfa: options.requiresMfa ?? false,
      isSystem: options.isSystem ?? false,
      permissions: { create: options.permissions.map((permissionKey) => ({ permissionKey })) },
      scopes: { create: (options.scopes ?? [{ type: 'company' }]).map(fromRoleScope) },
    },
  });
}

export async function grantRole(
  prisma: PrismaClient,
  user: { id: string; companyId: string },
  role: { id: string },
) {
  await prisma.userRole.create({
    data: { companyId: user.companyId, userId: user.id, roleId: role.id },
  });
}

/** Faz login pela API e devolve o header Authorization pronto. */
export async function authHeader(http: Http, email: string): Promise<{ Authorization: string }> {
  const res = await http().post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });
  const { accessToken } = authenticatedResponseSchema.parse(res.body);
  return { Authorization: `Bearer ${accessToken}` };
}
