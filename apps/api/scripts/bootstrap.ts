/**
 * Primeira empresa de um ambiente sem seed (produção): empresa, perfis padrão, um posto, o
 * administrador e um funcionário de teste para o app. Idempotente: rodar de novo não duplica
 * nada nem troca senha de quem já existe.
 *
 * As senhas são temporárias, geradas aqui e impressas uma vez: o primeiro acesso exige a
 * troca. Rode pelo workflow "Bootstrap" do GitHub Actions (ver deploy/README.md) ou:
 *
 *   DATABASE_URL=... pnpm --filter @excellence/api db:bootstrap
 *
 * Variáveis opcionais (padrões de teste, para editar depois pelo site):
 *   BOOTSTRAP_COMPANY_NAME, BOOTSTRAP_COMPANY_CNPJ, BOOTSTRAP_ADMIN_EMAIL,
 *   BOOTSTRAP_EMPLOYEE_EMAIL
 */
import { randomBytes } from 'node:crypto';
import { isValidCnpj, normalizeCnpj } from '@excellence/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { syncPermissionCatalog } from '../src/modules/access-control/application/permission-catalog';
import { fromRoleScope } from '../src/modules/access-control/domain/data-scope';
import { DEFAULT_ROLE_TEMPLATES } from '../src/modules/access-control/domain/default-roles';
import { PasswordHasher } from '../src/modules/auth/infrastructure/password-hasher';

/** CNPJ fictício com dígitos verificadores válidos (o do seed é outro). */
const FAKE_CNPJ = '11444777000161';
/** CPF fictício com dígitos verificadores válidos, para o funcionário de teste. */
const FAKE_CPF = '52998224725';

function temporaryPassword(): string {
  // 16 caracteres sem ambiguidade (sem 0/O, 1/l/I).
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join('');
}

/** Variável de ambiente, ou o padrão quando ausente ou vazia (campo do workflow em branco). */
function setting(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value === undefined || value === '' ? fallback : value;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL.');
  const name = setting('BOOTSTRAP_COMPANY_NAME', 'Teste');
  const cnpj = normalizeCnpj(setting('BOOTSTRAP_COMPANY_CNPJ', FAKE_CNPJ));
  if (!isValidCnpj(cnpj)) throw new Error(`CNPJ inválido: ${cnpj}`);
  const adminEmail = setting('BOOTSTRAP_ADMIN_EMAIL', 'admin@teste.com.br').toLowerCase();
  const employeeEmail = setting(
    'BOOTSTRAP_EMPLOYEE_EMAIL',
    'funcionario@teste.com.br',
  ).toLowerCase();

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const hasher = new PasswordHasher();
  const created: { email: string; password: string; role: string }[] = [];
  try {
    await syncPermissionCatalog(prisma);

    const company =
      (await prisma.company.findUnique({ where: { cnpj }, select: { id: true, name: true } })) ??
      (await prisma.company.create({
        data: { name, legalName: `${name} Ltda.`, cnpj, timezone: 'America/Fortaleza' },
        select: { id: true, name: true },
      }));
    const companyId = company.id;

    // Perfis padrão (só cria os que faltam; o Administrador da empresa pode mudá-los).
    const roleIds = new Map<string, string>();
    for (const template of DEFAULT_ROLE_TEMPLATES) {
      const existing = await prisma.role.findFirst({
        where: { companyId, name: template.name },
        select: { id: true },
      });
      if (existing) {
        roleIds.set(template.key, existing.id);
        continue;
      }
      const role = await prisma.role.create({
        data: {
          companyId,
          name: template.name,
          description: template.description,
          requiresMfa: template.requiresMfa,
          isSystem: true,
          permissions: {
            create: template.permissions.map((permissionKey) => ({ companyId, permissionKey })),
          },
          scopes: {
            create: template.scopes.map((scope) => ({ companyId, ...fromRoleScope(scope) })),
          },
        },
        select: { id: true },
      });
      roleIds.set(template.key, role.id);
    }
    const employeeRoleId = roleIds.get('employee');
    await prisma.company.update({
      where: { id: companyId },
      data: { defaultEmployeeRoleId: employeeRoleId ?? null },
    });

    const unit =
      (await prisma.unit.findFirst({ where: { companyId }, select: { id: true } })) ??
      (await prisma.unit.create({
        data: { companyId, name: 'Posto Teste', code: 'TESTE', city: 'São Luís', state: 'MA' },
        select: { id: true },
      }));

    const account = async (email: string, userName: string, roleKey: string) => {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) return existing.id;
      const password = temporaryPassword();
      const user = await prisma.user.create({
        data: {
          companyId,
          email,
          name: userName,
          passwordHash: await hasher.hash(password),
          mustChangePassword: true,
        },
        select: { id: true },
      });
      const roleId = roleIds.get(roleKey);
      if (roleId) await prisma.userRole.create({ data: { companyId, userId: user.id, roleId } });
      created.push({ email, password, role: roleKey });
      return user.id;
    };

    await account(adminEmail, 'Administrador Teste', 'admin');
    const employeeUserId = await account(employeeEmail, 'Funcionário Teste', 'employee');
    const hasRecord = await prisma.employee.findUnique({
      where: { userId: employeeUserId },
      select: { id: true },
    });
    if (!hasRecord) {
      await prisma.employee.create({
        data: {
          companyId,
          userId: employeeUserId,
          registrationNumber: 'TESTE-001',
          name: 'Funcionário Teste',
          cpf: FAKE_CPF,
          email: employeeEmail,
          hireDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
          unitId: unit.id,
        },
      });
    }

    process.stdout.write(`\nEmpresa: ${company.name} (CNPJ ${cnpj}) · id ${companyId}\n`);
    if (created.length === 0) {
      process.stdout.write(
        'Nenhuma conta nova: as contas já existiam (senhas não foram trocadas).\n',
      );
    }
    for (const item of created) {
      process.stdout.write(
        `Conta criada (${item.role}): ${item.email} · senha temporária: ${item.password}\n`,
      );
    }
    if (created.length > 0) {
      process.stdout.write('As senhas são temporárias: o primeiro acesso pede uma senha nova.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
