import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type Department,
  type departmentInputSchema,
  fromCents,
  type LaborUnion,
  type laborUnionInputSchema,
  optionalCents,
  type Position,
  type positionInputSchema,
} from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { duplicated, invalidReference, inUse } from './catalog-rules';

type DepartmentInput = z.output<typeof departmentInputSchema>;
type PositionInput = z.output<typeof positionInputSchema>;
type LaborUnionInput = z.output<typeof laborUnionInputSchema>;

const DEPARTMENT_SELECT = {
  id: true,
  name: true,
  code: true,
  unitId: true,
  isActive: true,
} as const;
const POSITION_SELECT = {
  id: true,
  name: true,
  cbo: true,
  baseSalaryCents: true,
  isActive: true,
} as const;

function toPosition(
  row: {
    id: string;
    name: string;
    cbo: string | null;
    baseSalaryCents: number | null;
    isActive: boolean;
  },
  canSeeSalary: boolean,
): Position {
  const { baseSalaryCents, ...rest } = row;
  return {
    ...rest,
    baseSalary: canSeeSalary && baseSalaryCents !== null ? fromCents(baseSalaryCents) : null,
  };
}
const UNION_SELECT = { id: true, name: true, cnpj: true, baseMonth: true, isActive: true } as const;

const activeFilter = (includeInactive: boolean) => (includeInactive ? {} : { isActive: true });

/**
 * Cadastros de apoio: departamentos, cargos e sindicatos. Mesma regra das unidades: leitura
 * pelo catálogo da empresa, gestão com escopo de empresa, exclusão só quando não há uso.
 */
@Injectable()
export class CatalogsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Departamentos ──────────────────────────────────────────────────────────────

  listDepartments(includeInactive: boolean): Promise<Department[]> {
    return this.db.client.department.findMany({
      where: activeFilter(includeInactive),
      select: DEPARTMENT_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async getDepartment(id: string): Promise<Department> {
    const row = await this.db.client.department.findUnique({
      where: { id },
      select: DEPARTMENT_SELECT,
    });
    if (!row) throw new NotFoundException('Departamento não encontrado.');
    return row;
  }

  async saveDepartment(
    id: string | null,
    input: DepartmentInput,
    grant: AccessGrant,
  ): Promise<Department> {
    assertCompanyWide(grant);
    const before = id ? await this.getDepartment(id) : null;
    if (input.unitId && (await this.db.client.unit.count({ where: { id: input.unitId } })) === 0) {
      throw invalidReference('unitId', 'Posto de trabalho não encontrado.');
    }
    if (input.code) {
      const taken = await this.db.client.department.count({
        where: { code: input.code, ...(id ? { id: { not: id } } : {}) },
      });
      if (taken > 0) throw duplicated('code', 'Já existe um departamento com este código.');
    }
    return this.db.client.$transaction(async (tx) => {
      const after = id
        ? await tx.department.update({ where: { id }, data: input, select: DEPARTMENT_SELECT })
        : await tx.department.create({
            data: { ...input, companyId: grant.companyId },
            select: DEPARTMENT_SELECT,
          });
      await this.audit.record(
        {
          action: id ? 'department.updated' : 'department.created',
          resourceType: 'department',
          resourceId: after.id,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }

  async removeDepartment(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.department.findUnique({
      where: { id },
      select: { name: true, _count: { select: { employees: true, roleScopes: true } } },
    });
    if (!row) throw new NotFoundException('Departamento não encontrado.');
    if (row._count.employees + row._count.roleScopes > 0) {
      throw inUse('O departamento tem funcionários ou perfis vinculados.');
    }
    await this.deleteWithAudit('department', id, row.name, (tx) =>
      tx.department.delete({ where: { id } }),
    );
  }

  // ─── Cargos ─────────────────────────────────────────────────────────────────────

  /** `canSeeSalary`: quem tem `payroll:manage` vê o salário base; os demais recebem null. */
  async listPositions(includeInactive: boolean, canSeeSalary: boolean): Promise<Position[]> {
    const rows = await this.db.client.position.findMany({
      where: activeFilter(includeInactive),
      select: POSITION_SELECT,
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => toPosition(row, canSeeSalary));
  }

  async getPosition(id: string, canSeeSalary: boolean): Promise<Position> {
    const row = await this.db.client.position.findUnique({
      where: { id },
      select: POSITION_SELECT,
    });
    if (!row) throw new NotFoundException('Cargo não encontrado.');
    return toPosition(row, canSeeSalary);
  }

  /** Sem `payroll:manage`, o salário enviado é ignorado e o atual é mantido. */
  async savePosition(
    id: string | null,
    input: PositionInput,
    grant: AccessGrant,
    canManageSalary: boolean,
  ): Promise<Position> {
    assertCompanyWide(grant);
    const before = id ? await this.getPosition(id, true) : null;
    const taken = await this.db.client.position.count({
      where: { name: input.name, ...(id ? { id: { not: id } } : {}) },
    });
    if (taken > 0) throw duplicated('name', 'Já existe um cargo com este nome.');
    const data = {
      name: input.name,
      cbo: input.cbo,
      isActive: input.isActive,
      ...(canManageSalary ? { baseSalaryCents: optionalCents(input.baseSalary) } : {}),
    };
    return this.db.client.$transaction(async (tx) => {
      const row = id
        ? await tx.position.update({ where: { id }, data, select: POSITION_SELECT })
        : await tx.position.create({
            data: { ...data, companyId: grant.companyId },
            select: POSITION_SELECT,
          });
      const after = toPosition(row, true);
      await this.audit.record(
        {
          action: id ? 'position.updated' : 'position.created',
          resourceType: 'position',
          resourceId: after.id,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return toPosition(row, canManageSalary);
    });
  }

  async removePosition(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.position.findUnique({
      where: { id },
      select: { name: true, _count: { select: { employees: true } } },
    });
    if (!row) throw new NotFoundException('Cargo não encontrado.');
    if (row._count.employees > 0) throw inUse('O cargo tem funcionários vinculados.');
    await this.deleteWithAudit('position', id, row.name, (tx) =>
      tx.position.delete({ where: { id } }),
    );
  }

  // ─── Sindicatos ─────────────────────────────────────────────────────────────────

  listUnions(includeInactive: boolean): Promise<LaborUnion[]> {
    return this.db.client.laborUnion.findMany({
      where: activeFilter(includeInactive),
      select: UNION_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async getUnion(id: string): Promise<LaborUnion> {
    const row = await this.db.client.laborUnion.findUnique({ where: { id }, select: UNION_SELECT });
    if (!row) throw new NotFoundException('Sindicato não encontrado.');
    return row;
  }

  async saveUnion(
    id: string | null,
    input: LaborUnionInput,
    grant: AccessGrant,
  ): Promise<LaborUnion> {
    assertCompanyWide(grant);
    const before = id ? await this.getUnion(id) : null;
    const taken = await this.db.client.laborUnion.count({
      where: { name: input.name, ...(id ? { id: { not: id } } : {}) },
    });
    if (taken > 0) throw duplicated('name', 'Já existe um sindicato com este nome.');
    return this.db.client.$transaction(async (tx) => {
      const after = id
        ? await tx.laborUnion.update({ where: { id }, data: input, select: UNION_SELECT })
        : await tx.laborUnion.create({
            data: { ...input, companyId: grant.companyId },
            select: UNION_SELECT,
          });
      await this.audit.record(
        {
          action: id ? 'union.updated' : 'union.created',
          resourceType: 'union',
          resourceId: after.id,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }

  async removeUnion(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const row = await this.db.client.laborUnion.findUnique({
      where: { id },
      select: { name: true, _count: { select: { employees: true } } },
    });
    if (!row) throw new NotFoundException('Sindicato não encontrado.');
    if (row._count.employees > 0) throw inUse('O sindicato tem funcionários vinculados.');
    await this.deleteWithAudit('union', id, row.name, (tx) =>
      tx.laborUnion.delete({ where: { id } }),
    );
  }

  private async deleteWithAudit(
    resourceType: string,
    id: string,
    name: string,
    remove: (
      tx: Parameters<Parameters<TenantPrismaService['client']['$transaction']>[0]>[0],
    ) => Promise<unknown>,
  ): Promise<void> {
    await this.db.client.$transaction(async (tx) => {
      await remove(tx);
      await this.audit.record(
        { action: `${resourceType}.deleted`, resourceType, resourceId: id, metadata: { name } },
        tx,
      );
    });
  }
}
