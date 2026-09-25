/**
 * Dados de exemplo para desenvolvimento. Idempotente: pode rodar várias vezes.
 * Cada etapa amplia este seed (perfis na 0.4, organização e pessoas na 1A.1 etc.).
 *
 * Uso: pnpm --filter @excellence/api db:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { syncPermissionCatalog } from '../src/modules/access-control/application/permission-catalog';
import { fromRoleScope } from '../src/modules/access-control/domain/data-scope';
import {
  DEFAULT_ROLE_TEMPLATES,
  type RoleTemplate,
} from '../src/modules/access-control/domain/default-roles';
import { PasswordHasher } from '../src/modules/auth/infrastructure/password-hasher';

export const SEED_COMPANY_ID = '01900000-0000-7000-8000-000000000001';

export const SEED_ROLE_IDS: Record<RoleTemplate['key'], string> = {
  admin: '01900000-0000-7000-8000-000000000201',
  hr: '01900000-0000-7000-8000-000000000202',
  manager: '01900000-0000-7000-8000-000000000203',
  employee: '01900000-0000-7000-8000-000000000204',
};

export const SEED_UNITS = {
  matriz: '01900000-0000-7000-8000-000000000301',
  campinas: '01900000-0000-7000-8000-000000000302',
} as const;

const SEED_DEPARTMENTS = {
  operacoes: '01900000-0000-7000-8000-000000000401',
  administrativo: '01900000-0000-7000-8000-000000000402',
} as const;

const SEED_POSITIONS = {
  vigilante: '01900000-0000-7000-8000-000000000501',
  supervisor: '01900000-0000-7000-8000-000000000502',
  analista: '01900000-0000-7000-8000-000000000503',
} as const;

const SEED_UNION_ID = '01900000-0000-7000-8000-000000000601';

export const SEED_USERS = [
  {
    id: '01900000-0000-7000-8000-000000000101',
    email: 'admin@exemplo.com.br',
    name: 'Ana Administradora',
    role: 'admin',
  },
  {
    id: '01900000-0000-7000-8000-000000000102',
    email: 'rh@exemplo.com.br',
    name: 'Rafael do RH',
    role: 'hr',
  },
  {
    id: '01900000-0000-7000-8000-000000000103',
    email: 'gestor@exemplo.com.br',
    name: 'Gabriela Gestora',
    role: 'manager',
  },
  {
    id: '01900000-0000-7000-8000-000000000104',
    email: 'funcionario@exemplo.com.br',
    name: 'Fábio Funcionário',
    role: 'employee',
  },
] as const;

/** CPF fictício, mas com dígitos verificadores válidos, a partir de 9 dígitos. */
export function fakeCpf(base: string): string {
  const digits = Array.from(base, Number);
  for (const length of [9, 10]) {
    const sum = digits.slice(0, length).reduce((acc, d, i) => acc + d * (length + 1 - i), 0);
    const rest = sum % 11;
    digits.push(rest < 2 ? 0 : 11 - rest);
  }
  return digits.join('');
}

const SEED_EMPLOYEES = [
  {
    id: '01900000-0000-7000-8000-000000000701',
    registrationNumber: '0001',
    name: 'Ana Administradora',
    cpf: fakeCpf('100000001'),
    hireDate: '2020-01-06',
    unitId: SEED_UNITS.matriz,
    departmentId: SEED_DEPARTMENTS.administrativo,
    positionId: SEED_POSITIONS.analista,
    managerId: null,
    userId: SEED_USERS[0].id,
  },
  {
    id: '01900000-0000-7000-8000-000000000702',
    registrationNumber: '0002',
    name: 'Rafael do RH',
    cpf: fakeCpf('100000002'),
    hireDate: '2021-03-01',
    unitId: SEED_UNITS.matriz,
    departmentId: SEED_DEPARTMENTS.administrativo,
    positionId: SEED_POSITIONS.analista,
    managerId: null,
    userId: SEED_USERS[1].id,
  },
  {
    id: '01900000-0000-7000-8000-000000000703',
    registrationNumber: '0003',
    name: 'Gabriela Gestora',
    cpf: fakeCpf('100000003'),
    hireDate: '2019-08-12',
    unitId: SEED_UNITS.matriz,
    departmentId: SEED_DEPARTMENTS.operacoes,
    positionId: SEED_POSITIONS.supervisor,
    managerId: null,
    userId: SEED_USERS[2].id,
  },
  {
    id: '01900000-0000-7000-8000-000000000704',
    registrationNumber: '0004',
    name: 'Fábio Funcionário',
    cpf: fakeCpf('100000004'),
    hireDate: '2023-05-15',
    unitId: SEED_UNITS.matriz,
    departmentId: SEED_DEPARTMENTS.operacoes,
    positionId: SEED_POSITIONS.vigilante,
    managerId: '01900000-0000-7000-8000-000000000703',
    userId: SEED_USERS[3].id,
  },
  {
    id: '01900000-0000-7000-8000-000000000705',
    registrationNumber: '0005',
    name: 'Carla Nunes',
    cpf: fakeCpf('100000005'),
    hireDate: '2024-02-01',
    unitId: SEED_UNITS.campinas,
    departmentId: SEED_DEPARTMENTS.operacoes,
    positionId: SEED_POSITIONS.vigilante,
    managerId: '01900000-0000-7000-8000-000000000703',
    userId: null,
  },
  {
    id: '01900000-0000-7000-8000-000000000706',
    registrationNumber: '0006',
    name: 'Diego Ramos',
    cpf: fakeCpf('100000006'),
    hireDate: '2024-07-22',
    unitId: SEED_UNITS.campinas,
    departmentId: SEED_DEPARTMENTS.operacoes,
    positionId: SEED_POSITIONS.vigilante,
    managerId: null,
    userId: null,
  },
] as const;

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

export async function seed(prisma: PrismaClient, password: string): Promise<void> {
  const passwordHash = await new PasswordHasher().hash(password);
  const companyId = SEED_COMPANY_ID;

  await prisma.company.upsert({
    where: { id: companyId },
    update: {},
    create: {
      id: companyId,
      name: 'Empresa Exemplo',
      legalName: 'Empresa Exemplo Serviços Ltda.',
      // CNPJ fictício com dígitos verificadores válidos.
      cnpj: '11222333000181',
      timezone: 'America/Sao_Paulo',
    },
  });

  await syncPermissionCatalog(prisma);

  // Perfis padrão: no ambiente de desenvolvimento, o seed os reaplica a partir dos modelos
  // (as permissões crescem a cada etapa).
  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const id = SEED_ROLE_IDS[template.key];
    const data = {
      name: template.name,
      description: template.description,
      requiresMfa: template.requiresMfa,
      isSystem: true,
    };
    await prisma.$transaction([
      prisma.role.upsert({ where: { id }, update: data, create: { id, companyId, ...data } }),
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      prisma.roleScope.deleteMany({ where: { roleId: id } }),
      prisma.rolePermission.createMany({
        data: template.permissions.map((permissionKey) => ({
          companyId,
          roleId: id,
          permissionKey,
        })),
      }),
      prisma.roleScope.createMany({
        data: template.scopes.map((scope) => ({ companyId, roleId: id, ...fromRoleScope(scope) })),
      }),
    ]);
  }
  // Contas criadas para funcionários recebem o perfil "Funcionário".
  await prisma.company.update({
    where: { id: companyId },
    data: { defaultEmployeeRoleId: SEED_ROLE_IDS.employee },
  });

  const units = [
    {
      id: SEED_UNITS.matriz,
      name: 'Matriz — São Paulo',
      code: 'MATRIZ',
      street: 'Avenida Paulista',
      number: '1000',
      district: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310100',
      latitude: -23.5653,
      longitude: -46.6515,
      geofenceRadiusMeters: 150,
    },
    {
      id: SEED_UNITS.campinas,
      name: 'Filial — Campinas',
      code: 'CAMPINAS',
      street: 'Avenida Francisco Glicério',
      number: '500',
      district: 'Centro',
      city: 'Campinas',
      state: 'SP',
      postalCode: '13012000',
      latitude: -22.9056,
      longitude: -47.0608,
      geofenceRadiusMeters: 200,
    },
  ];
  for (const unit of units) {
    await prisma.unit.upsert({
      where: { id: unit.id },
      update: {},
      create: { ...unit, companyId },
    });
  }

  const departments = [
    { id: SEED_DEPARTMENTS.operacoes, name: 'Operações', code: 'OPS', unitId: null },
    {
      id: SEED_DEPARTMENTS.administrativo,
      name: 'Administrativo',
      code: 'ADM',
      unitId: SEED_UNITS.matriz,
    },
  ];
  for (const department of departments) {
    await prisma.department.upsert({
      where: { id: department.id },
      update: {},
      create: { ...department, companyId },
    });
  }

  const positions = [
    { id: SEED_POSITIONS.vigilante, name: 'Vigilante' },
    { id: SEED_POSITIONS.supervisor, name: 'Supervisor de segurança' },
    { id: SEED_POSITIONS.analista, name: 'Analista administrativo' },
  ];
  for (const position of positions) {
    await prisma.position.upsert({
      where: { id: position.id },
      update: {},
      create: { ...position, companyId },
    });
  }

  await prisma.laborUnion.upsert({
    where: { id: SEED_UNION_ID },
    update: {},
    create: { id: SEED_UNION_ID, companyId, name: 'Sindicato da categoria (exemplo)' },
  });

  for (const { role, ...user } of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: { ...user, companyId, passwordHash },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: SEED_ROLE_IDS[role] } },
      update: {},
      create: { companyId, userId: user.id, roleId: SEED_ROLE_IDS[role] },
    });
  }

  // Primeiro sem gestor (o gestor pode ainda não existir), depois as ligações.
  for (const { managerId: _manager, hireDate, ...employee } of SEED_EMPLOYEES) {
    await prisma.employee.upsert({
      where: { id: employee.id },
      update: {},
      create: { ...employee, companyId, hireDate: date(hireDate), unionId: SEED_UNION_ID },
    });
  }
  for (const { id, managerId } of SEED_EMPLOYEES) {
    if (managerId) await prisma.employee.update({ where: { id }, data: { managerId } });
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
      `Seed concluído: empresa, 2 unidades, 4 perfis, ${SEED_USERS.length} usuários e ${SEED_EMPLOYEES.length} funcionários (senha em SEED_PASSWORD).\n`,
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
