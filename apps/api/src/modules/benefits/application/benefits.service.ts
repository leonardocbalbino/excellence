import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Benefit,
  type benefitInputSchema,
  type EmployeeBenefit,
  type employeeBenefitInputSchema,
  fromCents,
  type MyBenefit,
  optionalCents,
  ProblemType,
  toCents,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { Prisma } from '../../../generated/prisma/client';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { duplicated, inUse, invalidReference } from '../../organization/application/catalog-rules';
import { CompanyService } from '../../organization/application/company.service';
import { EmployeesService } from '../../workforce/application/employees.service';
import { fromCalendarDate, toCalendarDate, todayIn } from '../../workforce/domain/calendar';

type BenefitInput = z.output<typeof benefitInputSchema>;
type AssignmentInput = z.output<typeof employeeBenefitInputSchema>;

const BENEFIT_SELECT = {
  id: true,
  name: true,
  kind: true,
  provider: true,
  description: true,
  howToUse: true,
  defaultCompanyValueCents: true,
  defaultEmployeeDiscountCents: true,
  isActive: true,
} as const;

type BenefitRow = Prisma.BenefitGetPayload<{ select: typeof BENEFIT_SELECT }>;

function toBenefit(row: BenefitRow): Benefit {
  const { defaultCompanyValueCents, defaultEmployeeDiscountCents, ...rest } = row;
  return {
    ...rest,
    defaultCompanyValue:
      defaultCompanyValueCents === null ? null : fromCents(defaultCompanyValueCents),
    defaultEmployeeDiscount:
      defaultEmployeeDiscountCents === null ? null : fromCents(defaultEmployeeDiscountCents),
  };
}

const ASSIGNMENT_SELECT = {
  id: true,
  companyValueCents: true,
  employeeDiscountCents: true,
  startDate: true,
  endDate: true,
  notes: true,
  employee: { select: { id: true, name: true, socialName: true } },
  benefit: { select: BENEFIT_SELECT },
} as const;

type AssignmentRow = Prisma.EmployeeBenefitGetPayload<{ select: typeof ASSIGNMENT_SELECT }>;

function isActiveOn(row: { startDate: Date; endDate: Date | null }, today: string): boolean {
  const start = fromCalendarDate(row.startDate);
  const end = fromCalendarDate(row.endDate);
  return start <= today && (end === null || end >= today);
}

function toAssignment(row: AssignmentRow, today: string): EmployeeBenefit {
  return {
    id: row.id,
    employee: { id: row.employee.id, name: row.employee.socialName ?? row.employee.name },
    benefit: { id: row.benefit.id, name: row.benefit.name, kind: row.benefit.kind },
    companyValue: fromCents(row.companyValueCents),
    employeeDiscount: fromCents(row.employeeDiscountCents),
    startDate: fromCalendarDate(row.startDate),
    endDate: fromCalendarDate(row.endDate),
    notes: row.notes,
    active: isActiveOn(row, today),
  };
}

function overlap(): ProblemException {
  return new ProblemException({
    type: ProblemType.BenefitOverlap,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail: 'O funcionário já tem este benefício em parte desse período. Encerre o anterior antes.',
  });
}

/**
 * Benefícios (ADR 0017): catálogo da empresa e a atribuição a cada funcionário, com valores
 * e vigência. A atribuição respeita o escopo de `benefits:manage`.
 */
@Injectable()
export class BenefitsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly company: CompanyService,
    private readonly employees: EmployeesService,
  ) {}

  // ─── Catálogo ─────────────────────────────────────────────────────────────────────

  async list(includeInactive: boolean): Promise<Benefit[]> {
    const rows = await this.db.client.benefit.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: BENEFIT_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map(toBenefit);
  }

  async get(id: string): Promise<Benefit> {
    const row = await this.db.client.benefit.findUnique({ where: { id }, select: BENEFIT_SELECT });
    if (!row) throw new NotFoundException('Benefício não encontrado.');
    return toBenefit(row);
  }

  async save(id: string | null, input: BenefitInput, grant: AccessGrant): Promise<Benefit> {
    assertCompanyWide(grant);
    const before = id ? await this.get(id) : null;
    const taken = await this.db.client.benefit.count({
      where: { name: input.name, ...(id ? { id: { not: id } } : {}) },
    });
    if (taken > 0) throw duplicated('name', 'Já existe um benefício com este nome.');
    const data = {
      name: input.name,
      kind: input.kind,
      provider: input.provider,
      description: input.description,
      howToUse: input.howToUse,
      defaultCompanyValueCents: optionalCents(input.defaultCompanyValue),
      defaultEmployeeDiscountCents: optionalCents(input.defaultEmployeeDiscount),
      isActive: input.isActive,
    };
    return this.db.client.$transaction(async (tx) => {
      const row = id
        ? await tx.benefit.update({ where: { id }, data, select: BENEFIT_SELECT })
        : await tx.benefit.create({
            data: { ...data, companyId: grant.companyId },
            select: BENEFIT_SELECT,
          });
      const after = toBenefit(row);
      await this.audit.record(
        {
          action: id ? 'benefit.updated' : 'benefit.created',
          resourceType: 'benefit',
          resourceId: after.id,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }

  async remove(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.benefit.findUnique({
      where: { id },
      select: { name: true, _count: { select: { employees: true } } },
    });
    if (!row) throw new NotFoundException('Benefício não encontrado.');
    if (row._count.employees > 0) throw inUse('O benefício já foi atribuído a funcionários.');
    await this.db.client.$transaction(async (tx) => {
      await tx.benefit.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'benefit.deleted',
          resourceType: 'benefit',
          resourceId: id,
          metadata: { name: row.name },
        },
        tx,
      );
    });
  }

  // ─── Atribuição ───────────────────────────────────────────────────────────────────

  async ofEmployee(employeeId: string, grant: AccessGrant): Promise<EmployeeBenefit[]> {
    await this.employees.get(employeeId, grant);
    const today = await this.today();
    const rows = await this.db.client.employeeBenefit.findMany({
      where: { employeeId },
      select: ASSIGNMENT_SELECT,
      orderBy: [{ startDate: 'desc' }],
    });
    return rows.map((row) => toAssignment(row, today));
  }

  async saveAssignment(
    employeeId: string,
    id: string | null,
    input: AssignmentInput,
    grant: AccessGrant,
  ): Promise<EmployeeBenefit> {
    const employee = await this.employees.get(employeeId, grant);
    if (id) {
      const current = await this.db.client.employeeBenefit.findFirst({
        where: { id, employeeId },
        select: { id: true },
      });
      if (!current) throw new NotFoundException('Benefício do funcionário não encontrado.');
    }
    const benefit = await this.db.client.benefit.findUnique({
      where: { id: input.benefitId },
      select: { isActive: true },
    });
    if (!benefit?.isActive) {
      throw invalidReference('benefitId', 'Benefício não encontrado ou inativo.');
    }
    if (input.startDate < employee.hireDate) {
      throw invalidReference('startDate', 'O benefício não pode começar antes da admissão.');
    }
    const start = toCalendarDate(input.startDate);
    const end = input.endDate ? toCalendarDate(input.endDate) : null;
    const clash = await this.db.client.employeeBenefit.count({
      where: {
        employeeId,
        benefitId: input.benefitId,
        ...(id ? { id: { not: id } } : {}),
        ...(end ? { startDate: { lte: end } } : {}),
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
    });
    if (clash > 0) throw overlap();

    const data = {
      benefitId: input.benefitId,
      companyValueCents: toCents(input.companyValue),
      employeeDiscountCents: toCents(input.employeeDiscount),
      startDate: start,
      endDate: end,
      notes: input.notes,
    };
    const today = await this.today();
    return this.db.client.$transaction(async (tx) => {
      const row = id
        ? await tx.employeeBenefit.update({ where: { id }, data, select: ASSIGNMENT_SELECT })
        : await tx.employeeBenefit.create({
            data: { ...data, employeeId, companyId: grant.companyId, createdBy: grant.userId },
            select: ASSIGNMENT_SELECT,
          });
      const after = toAssignment(row, today);
      await this.audit.record(
        {
          action: id ? 'employee.benefit_updated' : 'employee.benefit_assigned',
          resourceType: 'employee',
          resourceId: employeeId,
          metadata: toAuditJson(after),
        },
        tx,
      );
      return after;
    });
  }

  async removeAssignment(employeeId: string, id: string, grant: AccessGrant): Promise<void> {
    await this.employees.get(employeeId, grant);
    const row = await this.db.client.employeeBenefit.findFirst({
      where: { id, employeeId },
      select: ASSIGNMENT_SELECT,
    });
    if (!row) throw new NotFoundException('Benefício do funcionário não encontrado.');
    const removed = toAssignment(row, await this.today());
    await this.db.client.$transaction(async (tx) => {
      await tx.employeeBenefit.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'employee.benefit_removed',
          resourceType: 'employee',
          resourceId: employeeId,
          metadata: toAuditJson(removed),
        },
        tx,
      );
    });
  }

  /** Benefícios vigentes do próprio funcionário (vazio para quem não tem cadastro). */
  async mine(userId: string): Promise<MyBenefit[]> {
    const employee = await this.db.client.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) return [];
    const today = await this.today();
    const day = toCalendarDate(today);
    const rows = await this.db.client.employeeBenefit.findMany({
      where: {
        employeeId: employee.id,
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gte: day } }],
      },
      select: ASSIGNMENT_SELECT,
      orderBy: { benefit: { name: 'asc' } },
    });
    return rows.map((row) => {
      const {
        defaultCompanyValue: _v,
        defaultEmployeeDiscount: _d,
        ...benefit
      } = toBenefit(row.benefit);
      return {
        id: row.id,
        benefit,
        companyValue: fromCents(row.companyValueCents),
        employeeDiscount: fromCents(row.employeeDiscountCents),
        startDate: fromCalendarDate(row.startDate),
        endDate: fromCalendarDate(row.endDate),
      };
    });
  }

  private async today(): Promise<string> {
    return todayIn(await this.company.timezone());
  }
}
