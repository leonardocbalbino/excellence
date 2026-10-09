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
import { newCodeToken } from '../src/modules/patrols/domain/code';
import { nationalHolidaySuggestions } from '../src/modules/scheduling/domain/national-holidays';

export const SEED_COMPANY_ID = '01900000-0000-7000-8000-000000000001';

export const SEED_ROLE_IDS: Record<RoleTemplate['key'], string> = {
  admin: '01900000-0000-7000-8000-000000000201',
  hr: '01900000-0000-7000-8000-000000000202',
  manager: '01900000-0000-7000-8000-000000000203',
  employee: '01900000-0000-7000-8000-000000000204',
};

export const SEED_UNITS = {
  matriz: '01900000-0000-7000-8000-000000000301',
} as const;

/** Filial de Campinas dos seeds antigos (removida: a empresa de exemplo tem só a Matriz). */
const LEGACY_BRANCH_ID = '01900000-0000-7000-8000-000000000302';

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
    name: 'Marina Analista',
    cpf: fakeCpf('100000001'),
    hireDate: '2020-01-06',
    unitId: SEED_UNITS.matriz,
    departmentId: SEED_DEPARTMENTS.administrativo,
    positionId: SEED_POSITIONS.analista,
    managerId: null,
    // Sem conta: o Administrador (SEED_USERS[0]) não é funcionário e não bate ponto.
    userId: null,
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
    unitId: SEED_UNITS.matriz,
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
    unitId: SEED_UNITS.matriz,
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
    // Fuso sempre reaplicado: a empresa de exemplo fica em São Luís (MA).
    update: { timezone: 'America/Fortaleza' },
    create: {
      id: companyId,
      name: 'Empresa Exemplo',
      legalName: 'Empresa Exemplo Serviços Ltda.',
      // CNPJ fictício com dígitos verificadores válidos.
      cnpj: '11222333000181',
      timezone: 'America/Fortaleza',
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
      name: 'Matriz — São Luís',
      code: 'MATRIZ',
      street: 'Avenida Santos Dumont',
      number: 'S/N',
      district: 'Anil',
      city: 'São Luís',
      state: 'MA',
      postalCode: '65137000',
      // Trecho da Av. Santos Dumont no Anil (OpenStreetMap).
      latitude: -2.5496,
      longitude: -44.2394,
      geofenceRadiusMeters: 150,
      timezone: null,
    },
  ];
  for (const unit of units) {
    await prisma.unit.upsert({
      where: { id: unit.id },
      // Reaplica o endereço de exemplo (bancos antigos tinham a Matriz em São Paulo).
      update: unit,
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
      // Nome e conta seguem o seed (bancos antigos tinham o Administrador ligado a um cadastro).
      update: { name: employee.name, userId: employee.userId, unitId: employee.unitId },
      create: { ...employee, companyId, hireDate: date(hireDate), unionId: SEED_UNION_ID },
    });
  }
  for (const { id, managerId } of SEED_EMPLOYEES) {
    if (managerId) await prisma.employee.update({ where: { id }, data: { managerId } });
  }

  // Bancos antigos tinham a filial de Campinas. Sem histórico, ela é excluída; com histórico
  // (marcações de ponto e outros registros append-only apontam a unidade), fica inativa.
  if (await prisma.unit.findUnique({ where: { id: LEGACY_BRANCH_ID }, select: { id: true } })) {
    try {
      await prisma.unit.delete({ where: { id: LEGACY_BRANCH_ID } });
    } catch {
      await prisma.unit.update({ where: { id: LEGACY_BRANCH_ID }, data: { isActive: false } });
    }
  }

  await seedScheduling(prisma);
  await seedPatrols(prisma);
  await seedBenefitsAndPayroll(prisma);
}

const SEED_SHIFTS = {
  comercial: '01900000-0000-7000-8000-000000000801',
  diurno12: '01900000-0000-7000-8000-000000000802',
  noturno12: '01900000-0000-7000-8000-000000000803',
} as const;

const SEED_SCHEDULES = {
  comercial: '01900000-0000-7000-8000-000000000901',
  diurno12x36: '01900000-0000-7000-8000-000000000902',
} as const;

/**
 * Jornada de exemplo. Os horários e intervalos são só ilustrativos: limites legais são
 * parâmetros do motor de cálculo (pendência P-012).
 */
async function seedScheduling(prisma: PrismaClient): Promise<void> {
  const companyId = SEED_COMPANY_ID;
  const shifts = [
    {
      id: SEED_SHIFTS.comercial,
      name: 'Comercial',
      startMinute: 8 * 60,
      endMinute: 17 * 60,
      breakMinutes: 60,
    },
    {
      id: SEED_SHIFTS.diurno12,
      name: 'Diurno 12h',
      startMinute: 7 * 60,
      endMinute: 19 * 60,
      breakMinutes: 60,
    },
    {
      id: SEED_SHIFTS.noturno12,
      name: 'Noturno 12h',
      startMinute: 19 * 60,
      endMinute: 7 * 60,
      breakMinutes: 60,
    },
  ];
  for (const shift of shifts) {
    await prisma.shift.upsert({
      where: { id: shift.id },
      update: {},
      create: { ...shift, companyId },
    });
  }

  const schedules = [
    {
      id: SEED_SCHEDULES.comercial,
      name: '5x2 comercial',
      kind: 'cycle' as const,
      cycleAnchor: 'monday' as const,
      days: [...Array<string>(5).fill(SEED_SHIFTS.comercial), null, null],
    },
    {
      id: SEED_SCHEDULES.diurno12x36,
      name: '12x36 diurno',
      kind: 'cycle' as const,
      cycleAnchor: 'assignment' as const,
      days: [SEED_SHIFTS.diurno12, null],
    },
  ];
  for (const { days, ...schedule } of schedules) {
    await prisma.workSchedule.upsert({
      where: { id: schedule.id },
      update: {},
      create: { ...schedule, companyId },
    });
    if ((await prisma.workScheduleDay.count({ where: { scheduleId: schedule.id } })) === 0) {
      await prisma.workScheduleDay.createMany({
        data: days.map((shiftId, dayIndex) => ({
          companyId,
          scheduleId: schedule.id,
          dayIndex,
          shiftId,
        })),
      });
    }
  }

  // Feriados nacionais de data fixa do ano corrente (sugestão conferível; pendência P-011).
  const year = new Date().getUTCFullYear();
  if ((await prisma.holiday.count({ where: { companyId, scope: 'national' } })) === 0) {
    await prisma.holiday.createMany({
      data: nationalHolidaySuggestions(year).map((h) => ({
        companyId,
        date: date(h.date),
        name: h.name,
        scope: 'national' as const,
      })),
    });
  }

  // Administrativos no 5x2; vigilantes na 12x36 (alternando o dia de início).
  const assignments = [
    ['01900000-0000-7000-8000-000000000701', SEED_SCHEDULES.comercial, '2026-01-05'],
    ['01900000-0000-7000-8000-000000000702', SEED_SCHEDULES.comercial, '2026-01-05'],
    ['01900000-0000-7000-8000-000000000703', SEED_SCHEDULES.comercial, '2026-01-05'],
    ['01900000-0000-7000-8000-000000000704', SEED_SCHEDULES.diurno12x36, '2026-01-05'],
    ['01900000-0000-7000-8000-000000000705', SEED_SCHEDULES.diurno12x36, '2026-01-06'],
    ['01900000-0000-7000-8000-000000000706', SEED_SCHEDULES.diurno12x36, '2026-01-05'],
  ] as const;
  for (const [employeeId, scheduleId, start] of assignments) {
    if ((await prisma.employeeScheduleAssignment.count({ where: { employeeId } })) > 0) continue;
    await prisma.employeeScheduleAssignment.create({
      data: {
        companyId,
        employeeId,
        scheduleId,
        startDate: date(start),
        cycleStartDate: date(start),
      },
    });
  }
}

const SEED_PATROL_POINTS = [
  ['01900000-0000-7000-8000-000000000a01', 'Portão principal'],
  ['01900000-0000-7000-8000-000000000a02', 'Estacionamento'],
  ['01900000-0000-7000-8000-000000000a03', 'Galpão'],
  ['01900000-0000-7000-8000-000000000a04', 'Portão dos fundos'],
] as const;
const SEED_PATROL_ROUTE_ID = '01900000-0000-7000-8000-000000000b01';

/** Rondas: 4 pontos na Matriz e a rota "Perímetro" do vigilante Fábio (ADR 0016). */
async function seedPatrols(prisma: PrismaClient): Promise<void> {
  const companyId = SEED_COMPANY_ID;
  const unitId = SEED_UNITS.matriz;
  for (const [id, name] of SEED_PATROL_POINTS) {
    await prisma.patrolPoint.upsert({
      where: { id },
      update: {},
      create: { id, companyId, unitId, name, codeToken: newCodeToken() },
    });
  }
  await prisma.patrolRoute.upsert({
    where: { id: SEED_PATROL_ROUTE_ID },
    update: {},
    create: {
      id: SEED_PATROL_ROUTE_ID,
      companyId,
      unitId,
      name: 'Perímetro',
      description: 'Volta completa pelos portões, estacionamento e galpão.',
      expectedMinutes: 40,
      // A cada 2 horas no turno diurno (07:00–19:00), todos os dias.
      startMinutes: [8 * 60, 10 * 60, 12 * 60, 14 * 60, 16 * 60, 18 * 60],
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    },
  });
  const routeId = SEED_PATROL_ROUTE_ID;
  if ((await prisma.patrolRoutePoint.count({ where: { routeId } })) === 0) {
    await prisma.patrolRoutePoint.createMany({
      data: SEED_PATROL_POINTS.map(([pointId], position) => ({
        routeId,
        pointId,
        position,
        companyId,
      })),
    });
    await prisma.patrolRouteAssignee.createMany({
      data: [{ routeId, employeeId: '01900000-0000-7000-8000-000000000704', companyId }],
    });
  }
}

const SEED_BENEFITS = {
  transporte: '01900000-0000-7000-8000-000000000c01',
  refeicao: '01900000-0000-7000-8000-000000000c02',
  saude: '01900000-0000-7000-8000-000000000c03',
} as const;

/** Salários dos cargos, benefícios atribuídos e links úteis (ADR 0017). */
async function seedBenefitsAndPayroll(prisma: PrismaClient): Promise<void> {
  const companyId = SEED_COMPANY_ID;
  const salaries = [
    [SEED_POSITIONS.vigilante, 235_000],
    [SEED_POSITIONS.supervisor, 420_000],
    [SEED_POSITIONS.analista, 380_000],
  ] as const;
  for (const [id, cents] of salaries) {
    // Não sobrescreve um salário já ajustado pelo RH.
    await prisma.position.updateMany({
      where: { id, baseSalaryCents: null },
      data: { baseSalaryCents: cents },
    });
  }

  const benefits = [
    {
      id: SEED_BENEFITS.transporte,
      name: 'Vale-transporte',
      kind: 'transport' as const,
      provider: 'Transporte coletivo de São Luís',
      description: 'Deslocamento casa–trabalho. Desconto de até 6% do salário base.',
      howToUse: 'O crédito cai no seu cartão de transporte no primeiro dia útil do mês.',
      defaultCompanyValueCents: 22_000,
    },
    {
      id: SEED_BENEFITS.refeicao,
      name: 'Vale-refeição',
      kind: 'meal' as const,
      provider: 'Cartão refeição',
      description: 'R$ 35 por dia trabalhado, creditado no cartão.',
      howToUse: 'Use o cartão em restaurantes credenciados. Saldo no aplicativo do cartão.',
      defaultCompanyValueCents: 77_000,
    },
    {
      id: SEED_BENEFITS.saude,
      name: 'Plano de saúde',
      kind: 'health' as const,
      provider: 'Operadora de exemplo',
      description: 'Plano enfermaria com coparticipação. Dependentes podem ser incluídos.',
      howToUse: 'Carteirinha digital no aplicativo da operadora. Rede credenciada no site.',
      defaultCompanyValueCents: 45_000,
    },
  ];
  for (const benefit of benefits) {
    await prisma.benefit.upsert({
      where: { id: benefit.id },
      update: { provider: benefit.provider, howToUse: benefit.howToUse },
      create: { ...benefit, companyId },
    });
  }

  // Todos os funcionários com cadastro recebem os três benefícios desde a admissão.
  for (const employee of SEED_EMPLOYEES) {
    if ((await prisma.employeeBenefit.count({ where: { employeeId: employee.id } })) > 0) continue;
    await prisma.employeeBenefit.createMany({
      data: [
        [SEED_BENEFITS.transporte, 22_000, 14_100],
        [SEED_BENEFITS.refeicao, 77_000, 0],
        [SEED_BENEFITS.saude, 45_000, 6_000],
      ].map(([benefitId, companyValueCents, employeeDiscountCents]) => ({
        companyId,
        employeeId: employee.id,
        benefitId: String(benefitId),
        companyValueCents: Number(companyValueCents),
        employeeDiscountCents: Number(employeeDiscountCents),
        startDate: date(employee.hireDate),
        createdBy: SEED_USERS[1].id,
      })),
    });
  }

  const links = [
    [
      '01900000-0000-7000-8000-000000000d01',
      'Carteira de Trabalho Digital',
      'https://www.gov.br/trabalho-e-emprego/pt-br/servicos/trabalhador/carteira-de-trabalho',
      'Governo',
    ],
    [
      '01900000-0000-7000-8000-000000000d02',
      'Consulta ao FGTS',
      'https://www.fgts.gov.br/',
      'Governo',
    ],
    ['01900000-0000-7000-8000-000000000d03', 'Meu INSS', 'https://meu.inss.gov.br/', 'Governo'],
  ] as const;
  for (const [id, name, url, category] of links) {
    await prisma.usefulLink.upsert({
      where: { id },
      update: {},
      create: { id, companyId, name, url, category, position: links.findIndex((l) => l[0] === id) },
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
      `Seed concluído: empresa, 1 unidade, 4 perfis, ${SEED_USERS.length} usuários e ${SEED_EMPLOYEES.length} funcionários (senha em SEED_PASSWORD).\n`,
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
