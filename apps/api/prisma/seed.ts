/**
 * Dados de exemplo para desenvolvimento. Idempotente: pode rodar várias vezes.
 * Cada etapa amplia este seed (perfis na 0.4, unidades na 1A.1 etc.).
 *
 * Uso: pnpm --filter @excellence/api db:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { PasswordHasher } from '../src/modules/auth/infrastructure/password-hasher';

export const SEED_COMPANY_ID = '01900000-0000-7000-8000-000000000001';

export const SEED_USERS = [
  {
    id: '01900000-0000-7000-8000-000000000101',
    email: 'admin@exemplo.com.br',
    name: 'Ana Administradora',
  },
  { id: '01900000-0000-7000-8000-000000000102', email: 'rh@exemplo.com.br', name: 'Rafael do RH' },
  {
    id: '01900000-0000-7000-8000-000000000103',
    email: 'gestor@exemplo.com.br',
    name: 'Gabriela Gestora',
  },
  {
    id: '01900000-0000-7000-8000-000000000104',
    email: 'funcionario@exemplo.com.br',
    name: 'Fábio Funcionário',
  },
] as const;

export async function seed(prisma: PrismaClient, password: string): Promise<void> {
  const passwordHash = await new PasswordHasher().hash(password);

  await prisma.company.upsert({
    where: { id: SEED_COMPANY_ID },
    update: {},
    create: { id: SEED_COMPANY_ID, name: 'Empresa Exemplo Ltda.' },
  });

  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: { ...user, companyId: SEED_COMPANY_ID, passwordHash },
    });
  }
}

async function main(): Promise<void> {
  for (const file of ['.env', '../../.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // arquivo opcional
    }
  }
  if (process.env.NODE_ENV === 'production') throw new Error('O seed não roda em produção.');
  const url = process.env.DATABASE_URL;
  const password = process.env.SEED_PASSWORD;
  if (!url || !password) throw new Error('Defina DATABASE_URL e SEED_PASSWORD.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await seed(prisma, password);
    process.stdout.write(
      `Seed concluído: ${SEED_USERS.length} usuários (senha em SEED_PASSWORD).\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
