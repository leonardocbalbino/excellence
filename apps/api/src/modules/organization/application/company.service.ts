import { Injectable, NotFoundException } from '@nestjs/common';
import { type Company, type companyInputSchema, isPermission } from '@excellence/shared';
import type { z } from 'zod';
import { RequestContext } from '../../../common/context/request-context';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCanGrant, assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';
import { duplicated, invalidReference } from './catalog-rules';

type CompanyInput = z.output<typeof companyInputSchema>;

const COMPANY_SELECT = {
  id: true,
  name: true,
  legalName: true,
  cnpj: true,
  timezone: true,
  defaultEmployeeRoleId: true,
} as const;

@Injectable()
export class CompanyService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<Company> {
    const company = await this.db.client.company.findUnique({
      where: { id: RequestContext.require().companyId },
      select: COMPANY_SELECT,
    });
    if (!company) throw new NotFoundException('Empresa não encontrada.');
    return company;
  }

  /** Fuso da empresa (padrão para exibição e para calcular "hoje"). */
  async timezone(): Promise<string> {
    return (await this.get()).timezone;
  }

  async update(input: CompanyInput, grant: AccessGrant): Promise<Company> {
    assertCompanyWide(grant);
    const before = await this.get();

    if (
      input.defaultEmployeeRoleId &&
      input.defaultEmployeeRoleId !== before.defaultEmployeeRoleId
    ) {
      const role = await this.db.client.role.findUnique({
        where: { id: input.defaultEmployeeRoleId },
        select: { permissions: { select: { permissionKey: true } } },
      });
      if (!role) throw invalidReference('defaultEmployeeRoleId', 'Perfil não encontrado.');
      // O perfil padrão vai para toda conta nova: quem configura precisa ter as permissões dele.
      assertCanGrant(grant, role.permissions.map((p) => p.permissionKey).filter(isPermission));
    }
    if (input.cnpj && input.cnpj !== before.cnpj) {
      // O CNPJ é único no sistema todo: a checagem precisa do client sem isolamento, e só
      // confere se existe (não lê dados de outra empresa).
      const taken = await this.prisma.company.count({
        where: { cnpj: input.cnpj, id: { not: grant.companyId } },
      });
      if (taken > 0) throw duplicated('cnpj', 'Este CNPJ já está cadastrado.');
    }

    return this.db.client.$transaction(async (tx) => {
      const after = await tx.company.update({
        where: { id: grant.companyId },
        data: input,
        select: COMPANY_SELECT,
      });
      await this.audit.record(
        {
          action: 'company.updated',
          resourceType: 'company',
          resourceId: grant.companyId,
          metadata: toAuditJson({ before, after }),
        },
        tx,
      );
      return after;
    });
  }
}
