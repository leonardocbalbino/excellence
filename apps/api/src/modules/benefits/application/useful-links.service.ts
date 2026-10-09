import { Injectable, NotFoundException } from '@nestjs/common';
import type { UsefulLink, usefulLinkInputSchema } from '@excellence/shared';
import type { z } from 'zod';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';

type LinkInput = z.output<typeof usefulLinkInputSchema>;

const LINK_SELECT = {
  id: true,
  name: true,
  url: true,
  description: true,
  category: true,
  position: true,
  isActive: true,
} as const;

/** Links úteis mostrados a todos os usuários da empresa (ADR 0017). */
@Injectable()
export class UsefulLinksService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive: boolean): Promise<UsefulLink[]> {
    return this.db.client.usefulLink.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: LINK_SELECT,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string): Promise<UsefulLink> {
    const row = await this.db.client.usefulLink.findUnique({ where: { id }, select: LINK_SELECT });
    if (!row) throw new NotFoundException('Link não encontrado.');
    return row;
  }

  async save(id: string | null, input: LinkInput, grant: AccessGrant): Promise<UsefulLink> {
    assertCompanyWide(grant);
    const before = id ? await this.get(id) : null;
    return this.db.client.$transaction(async (tx) => {
      const after = id
        ? await tx.usefulLink.update({ where: { id }, data: input, select: LINK_SELECT })
        : await tx.usefulLink.create({
            data: { ...input, companyId: grant.companyId },
            select: LINK_SELECT,
          });
      await this.audit.record(
        {
          action: id ? 'useful_link.updated' : 'useful_link.created',
          resourceType: 'useful_link',
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
    const before = await this.get(id);
    await this.db.client.$transaction(async (tx) => {
      await tx.usefulLink.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'useful_link.deleted',
          resourceType: 'useful_link',
          resourceId: id,
          metadata: toAuditJson(before),
        },
        tx,
      );
    });
  }
}
