import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreatedAccount,
  type Employee,
  type employeeInputSchema,
  type employeeListQuerySchema,
  type EmployeePage,
  ProblemType,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { generateTemporaryPassword } from '../../auth/application/password.service';
import { PasswordHasher } from '../../auth/infrastructure/password-hasher';
import { CompanyService } from '../../organization/application/company.service';
import { duplicated } from '../../organization/application/catalog-rules';
import { employeeStatus, fromCalendarDate, toCalendarDate, todayIn } from '../domain/calendar';
import {
  type EmployeePlacement,
  employeeScopeWhere,
  isInScope,
  type ScopeActor,
} from '../domain/employee-scope';
import { checkEmployeeReferences, referenceProblem } from './employee-references';

type EmployeeInput = z.output<typeof employeeInputSchema>;
type EmployeeListQuery = z.output<typeof employeeListQuerySchema>;

export const EMPLOYEE_INCLUDE = {
  unit: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  union: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true, socialName: true } },
} as const;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof EMPLOYEE_INCLUDE }>;

export function toEmployee(row: EmployeeRow, today: string): Employee {
  const terminationDate = fromCalendarDate(row.terminationDate);
  return {
    id: row.id,
    registrationNumber: row.registrationNumber,
    name: row.name,
    socialName: row.socialName,
    cpf: row.cpf,
    pis: row.pis,
    birthDate: fromCalendarDate(row.birthDate),
    email: row.email,
    phone: row.phone,
    hireDate: fromCalendarDate(row.hireDate),
    terminationDate,
    status: employeeStatus(terminationDate, today),
    unit: row.unit,
    department: row.department,
    position: row.position,
    union: row.union,
    // Nome social prevalece na exibição.
    manager: row.manager
      ? { id: row.manager.id, name: row.manager.socialName ?? row.manager.name }
      : null,
    userId: row.userId,
  };
}

export function toEmployeeData(input: EmployeeInput) {
  return {
    ...input,
    birthDate: input.birthDate ? toCalendarDate(input.birthDate) : null,
    hireDate: toCalendarDate(input.hireDate),
    terminationDate: input.terminationDate ? toCalendarDate(input.terminationDate) : null,
  };
}

function outOfScope(): ProblemException {
  return new ProblemException({
    type: ProblemType.OutOfScope,
    title: 'Forbidden',
    status: HttpStatus.FORBIDDEN,
    detail: 'Este funcionário está fora do escopo de dados do seu perfil.',
  });
}

/**
 * Funcionários. Toda leitura e escrita passa pelo escopo concedido na permissão da rota
 * (unidades, departamentos, equipe ou o próprio registro), além do isolamento por empresa.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
  ) {}

  async actor(grant: AccessGrant): Promise<ScopeActor> {
    const own = await this.db.client.employee.findUnique({
      where: { userId: grant.userId },
      select: { id: true },
    });
    return { userId: grant.userId, employeeId: own?.id ?? null };
  }

  async list(query: EmployeeListQuery, grant: AccessGrant): Promise<EmployeePage> {
    const scope = employeeScopeWhere(requireScope(grant), await this.actor(grant));
    const empty = { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    if (!scope) return empty;

    const today = todayIn(await this.company.timezone());
    const todayDate = toCalendarDate(today);
    const filters: Prisma.EmployeeWhereInput[] = [scope];
    if (query.unitId) filters.push({ unitId: query.unitId });
    if (query.departmentId) filters.push({ departmentId: query.departmentId });
    if (query.status === 'active') {
      filters.push({ OR: [{ terminationDate: null }, { terminationDate: { gte: todayDate } }] });
    } else if (query.status === 'terminated') {
      filters.push({ terminationDate: { lt: todayDate } });
    }
    if (query.search) {
      const digits = query.search.replace(/\D/g, '');
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { socialName: { contains: query.search, mode: 'insensitive' } },
          { registrationNumber: { contains: query.search } },
          ...(digits.length >= 3 ? [{ cpf: { startsWith: digits } }] : []),
        ],
      });
    }

    const where = { AND: filters };
    const [total, rows] = await Promise.all([
      this.db.client.employee.count({ where }),
      this.db.client.employee.findMany({
        where,
        include: EMPLOYEE_INCLUDE,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => toEmployee(row, today)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string, grant: AccessGrant): Promise<Employee> {
    const scope = employeeScopeWhere(requireScope(grant), await this.actor(grant));
    const row = scope
      ? await this.db.client.employee.findFirst({
          where: { AND: [{ id }, scope] },
          include: EMPLOYEE_INCLUDE,
        })
      : null;
    // Fora do escopo responde como inexistente, sem revelar que o registro existe.
    if (!row) throw new NotFoundException('Funcionário não encontrado.');
    return toEmployee(row, todayIn(await this.company.timezone()));
  }

  /** Registro de funcionário do próprio usuário (tela "meus dados", ponto etc.). */
  async mine(userId: string): Promise<Employee> {
    const row = await this.db.client.employee.findUnique({
      where: { userId },
      include: EMPLOYEE_INCLUDE,
    });
    if (!row)
      throw new NotFoundException('Seu usuário não está ligado a um cadastro de funcionário.');
    return toEmployee(row, todayIn(await this.company.timezone()));
  }

  async create(input: EmployeeInput, grant: AccessGrant): Promise<Employee> {
    const actor = await this.actor(grant);
    if (!isInScope(requireScope(grant), actor, { ...input, userId: null })) throw outOfScope();
    await this.assertUnique(input, null);
    const errors = await checkEmployeeReferences(this.db.client, input, null);
    if (errors.length > 0) throw referenceProblem(errors);

    const today = todayIn(await this.company.timezone());
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.employee.create({
        data: { ...toEmployeeData(input), companyId: grant.companyId },
        include: EMPLOYEE_INCLUDE,
      });
      const employee = toEmployee(row, today);
      await this.audit.record(
        {
          action: 'employee.created',
          resourceType: 'employee',
          resourceId: row.id,
          metadata: toAuditJson(employee),
        },
        tx,
      );
      return employee;
    });
  }

  async update(id: string, input: EmployeeInput, grant: AccessGrant): Promise<Employee> {
    const actor = await this.actor(grant);
    const scope = requireScope(grant);
    const before = await this.get(id, grant);
    const target: EmployeePlacement = { ...input, id, userId: before.userId };
    // Não dá para mover alguém para fora do próprio escopo.
    if (!isInScope(scope, actor, target)) throw outOfScope();
    await this.assertUnique(input, id);
    const errors = await checkEmployeeReferences(this.db.client, input, id);
    if (errors.length > 0) throw referenceProblem(errors);

    const today = todayIn(await this.company.timezone());
    return this.db.client.$transaction(async (tx) => {
      const row = await tx.employee.update({
        where: { id },
        data: toEmployeeData(input),
        include: EMPLOYEE_INCLUDE,
      });
      const after = toEmployee(row, today);
      await this.audit.record(
        {
          action: 'employee.updated',
          resourceType: 'employee',
          resourceId: id,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }

  /**
   * Cria a conta de acesso do funcionário com senha temporária (exibida uma vez e trocada
   * no primeiro acesso) e o perfil padrão configurado pela empresa, se houver.
   */
  async createAccount(id: string, email: string, grant: AccessGrant): Promise<CreatedAccount> {
    const employee = await this.get(id, grant);
    if (employee.userId) {
      throw new ProblemException({
        type: ProblemType.AccountAlreadyExists,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'Este funcionário já tem conta de acesso.',
      });
    }
    // E-mail de login é único no sistema todo (ADR 0006): a checagem usa o client sem
    // isolamento e só confere se existe.
    if ((await this.prisma.user.count({ where: { email } })) > 0) {
      throw duplicated('email', 'Este e-mail já é usado por outra conta.');
    }
    const { defaultEmployeeRoleId } = await this.company.get();
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.hasher.hash(temporaryPassword);

    const user = await this.db.client.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          companyId: grant.companyId,
          email,
          name: employee.socialName ?? employee.name,
          passwordHash,
          mustChangePassword: true,
        },
        select: { id: true, email: true },
      });
      await tx.employee.update({ where: { id }, data: { userId: created.id } });
      if (defaultEmployeeRoleId) {
        await tx.userRole.create({
          data: {
            companyId: grant.companyId,
            userId: created.id,
            roleId: defaultEmployeeRoleId,
            grantedBy: grant.userId,
          },
        });
      }
      await this.audit.record(
        {
          action: 'employee.account_created',
          resourceType: 'employee',
          resourceId: id,
          metadata: { userId: created.id, email, defaultRoleId: defaultEmployeeRoleId },
        },
        tx,
      );
      return created;
    });
    return { userId: user.id, email: user.email, temporaryPassword };
  }

  private async assertUnique(input: EmployeeInput, exceptId: string | null): Promise<void> {
    const not = exceptId ? { id: { not: exceptId } } : {};
    const [cpf, registration] = await Promise.all([
      this.db.client.employee.count({ where: { cpf: input.cpf, ...not } }),
      this.db.client.employee.count({
        where: { registrationNumber: input.registrationNumber, ...not },
      }),
    ]);
    if (cpf > 0) throw duplicated('cpf', 'Já existe um funcionário com este CPF.');
    if (registration > 0)
      throw duplicated('registrationNumber', 'Já existe um funcionário com esta matrícula.');
  }
}

function requireScope(grant: AccessGrant) {
  if (!grant.scope) throw new Error('Rota de funcionários sem escopo de permissão');
  return grant.scope;
}
