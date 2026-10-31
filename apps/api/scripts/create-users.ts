/**
 * Cria contas de acesso da gestão (Administrador, RH, Gestor) numa empresa já existente. As
 * senhas são temporárias, geradas aqui e impressas uma vez: o primeiro acesso exige a troca.
 * Idempotente: e-mail que já existe é mantido (a senha não muda).
 *
 * Rode pelo workflow "Criar usuários" (ver deploy/README.md) ou:
 *
 *   DATABASE_URL=... CREATE_USERS="Nome|email|Perfil; ..." pnpm --filter @excellence/api exec tsx scripts/create-users.ts
 *
 * Variáveis:
 *   CREATE_USERS   "Nome|e-mail|Perfil" separados por ";" (Perfil = nome do perfil, ex.: RH)
 *   COMPANY_CNPJ   opcional; sem ele, o banco precisa ter uma empresa só
 */
import { randomBytes } from 'node:crypto';
import { normalizeCnpj } from '@excellence/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { PasswordHasher } from '../src/modules/auth/infrastructure/password-hasher';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function temporaryPassword(): string {
  // 16 caracteres sem ambiguidade (sem 0/O, 1/l/I).
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join('');
}

function parseUsers(raw: string): { name: string; email: string; role: string }[] {
  return raw
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name = '', email = '', role = ''] = item.split('|').map((part) => part.trim());
      if (!name || !EMAIL.test(email) || !role) {
        throw new Error(`Linha inválida: "${item}" (use Nome|e-mail|Perfil).`);
      }
      return { name: name.replace(/\s+/g, ' '), email: email.toLowerCase(), role };
    });
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL.');
  const users = parseUsers(process.env.CREATE_USERS ?? '');
  if (users.length === 0) throw new Error('Defina CREATE_USERS.');
  const cnpj = process.env.COMPANY_CNPJ?.trim();

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const hasher = new PasswordHasher();
  try {
    const companies = await prisma.company.findMany({
      where: cnpj ? { cnpj: normalizeCnpj(cnpj) } : {},
      select: { id: true, name: true },
    });
    const [company] = companies;
    if (!company || companies.length !== 1) {
      throw new Error(
        cnpj
          ? `Empresa com CNPJ ${cnpj} não encontrada.`
          : `Há ${companies.length} empresas no banco: informe COMPANY_CNPJ.`,
      );
    }
    process.stdout.write(`Empresa: ${company.name}\n`);

    for (const user of users) {
      const role = await prisma.role.findFirst({
        where: { companyId: company.id, name: { equals: user.role, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (!role) throw new Error(`Perfil "${user.role}" não existe na empresa.`);

      const existing = await prisma.user.findUnique({
        where: { email: user.email },
        select: { id: true, companyId: true },
      });
      if (existing) {
        if (existing.companyId !== company.id) {
          throw new Error(`${user.email} já é usado em outra empresa.`);
        }
        await prisma.userRole.createMany({
          data: [{ companyId: company.id, userId: existing.id, roleId: role.id }],
          skipDuplicates: true,
        });
        process.stdout.write(
          `- ${user.email}: já existia (senha mantida), perfil ${role.name} garantido.\n`,
        );
        continue;
      }
      const password = temporaryPassword();
      const created = await prisma.user.create({
        data: {
          companyId: company.id,
          email: user.email,
          name: user.name,
          passwordHash: await hasher.hash(password),
          mustChangePassword: true,
        },
        select: { id: true },
      });
      await prisma.userRole.create({
        data: { companyId: company.id, userId: created.id, roleId: role.id },
      });
      process.stdout.write(
        `- Conta criada (${role.name}): ${user.name} · ${user.email} · senha temporária: ${password}\n`,
      );
    }
    process.stdout.write('As senhas são temporárias: o primeiro acesso pede uma senha nova.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
