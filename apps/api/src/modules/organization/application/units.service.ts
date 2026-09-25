import { Injectable, NotFoundException } from '@nestjs/common';
import type { Unit, unitInputSchema } from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { duplicated, inUse } from './catalog-rules';

type UnitInput = z.output<typeof unitInputSchema>;

const UNIT_SELECT = {
  id: true,
  name: true,
  code: true,
  cnpj: true,
  street: true,
  number: true,
  complement: true,
  district: true,
  city: true,
  state: true,
  postalCode: true,
  latitude: true,
  longitude: true,
  geofenceRadiusMeters: true,
  timezone: true,
  isActive: true,
} as const;

/**
 * Unidades (locais de trabalho). Leitura: catálogo da empresa inteira para quem tem
 * `units:read`. Gestão: exige escopo de empresa (ADR 0010).
 */
@Injectable()
export class UnitsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive: boolean): Promise<Unit[]> {
    return this.db.client.unit.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: UNIT_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string): Promise<Unit> {
    const unit = await this.db.client.unit.findUnique({ where: { id }, select: UNIT_SELECT });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    return unit;
  }

  async create(input: UnitInput, grant: AccessGrant): Promise<Unit> {
    assertCompanyWide(grant);
    await this.assertCodeAvailable(input.code, null);
    return this.db.client.$transaction(async (tx) => {
      const unit = await tx.unit.create({
        data: { ...input, companyId: grant.companyId },
        select: UNIT_SELECT,
      });
      await this.audit.record(
        {
          action: 'unit.created',
          resourceType: 'unit',
          resourceId: unit.id,
          metadata: toAuditJson(unit),
        },
        tx,
      );
      return unit;
    });
  }

  async update(id: string, input: UnitInput, grant: AccessGrant): Promise<Unit> {
    assertCompanyWide(grant);
    const before = await this.get(id);
    await this.assertCodeAvailable(input.code, id);
    return this.db.client.$transaction(async (tx) => {
      const after = await tx.unit.update({ where: { id }, data: input, select: UNIT_SELECT });
      await this.audit.record(
        {
          action: 'unit.updated',
          resourceType: 'unit',
          resourceId: id,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }

  async remove(id: string, grant: AccessGrant): Promise<void> {
    assertCompanyWide(grant);
    const unit = await this.db.client.unit.findUnique({
      where: { id },
      select: {
        name: true,
        _count: { select: { employees: true, departments: true, roleScopes: true } },
      },
    });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    const { employees, departments, roleScopes } = unit._count;
    if (employees + departments + roleScopes > 0) {
      throw inUse('A unidade tem funcionários, departamentos ou perfis vinculados.');
    }
    await this.db.client.$transaction(async (tx) => {
      await tx.unit.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'unit.deleted',
          resourceType: 'unit',
          resourceId: id,
          metadata: { name: unit.name },
        },
        tx,
      );
    });
  }

  private async assertCodeAvailable(code: string | null, exceptId: string | null): Promise<void> {
    if (!code) return;
    const taken = await this.db.client.unit.count({
      where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (taken > 0) throw duplicated('code', 'Já existe uma unidade com este código.');
  }
}
