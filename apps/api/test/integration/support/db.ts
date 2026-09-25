import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { inject } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma/client';
import { PasswordHasher } from '../../../src/modules/auth/infrastructure/password-hasher';

/** Client direto no banco de teste, para preparar e inspecionar dados fora da API. */
export function createTestPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: inject('infraEnv').DATABASE_URL }),
  });
}

export const TEST_PASSWORD = 'Senha-de-teste-123';

let hasher: PasswordHasher | undefined;

/** Cria empresa + usuário ativo com a senha padrão de teste. E-mail único por chamada. */
export async function createTestUser(
  prisma: PrismaClient,
  overrides: { email?: string; isActive?: boolean; companyId?: string } = {},
) {
  if (!hasher) {
    hasher = new PasswordHasher();
    await hasher.onModuleInit();
  }
  const companyId =
    overrides.companyId ??
    (await prisma.company.create({ data: { name: `Empresa ${randomUUID()}` } })).id;
  return prisma.user.create({
    data: {
      companyId,
      email: overrides.email ?? `user-${randomUUID()}@teste.com.br`,
      name: 'Usuário de Teste',
      passwordHash: await hasher.hash(TEST_PASSWORD),
      isActive: overrides.isActive ?? true,
    },
  });
}
