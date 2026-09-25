import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuditLog, AuditLogPage, auditLogQuerySchema } from '@excellence/shared';
import type { z } from 'zod';
import type { Prisma } from '../../../generated/prisma/client';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';

type AuditLogQuery = z.output<typeof auditLogQuerySchema>;

interface Cursor {
  occurredAt: Date;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.occurredAt.toISOString()}|${cursor.id}`).toString('base64url');
}

function decodeCursor(raw: string): Cursor {
  const [iso, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  const occurredAt = new Date(iso ?? '');
  if (!id || Number.isNaN(occurredAt.getTime())) throw new BadRequestException('Cursor inválido.');
  return { occurredAt, id };
}

/** Consulta da trilha de auditoria, da mais recente para a mais antiga, paginada por cursor. */
@Injectable()
export class AuditQueryService {
  constructor(private readonly db: TenantPrismaService) {}

  async list(query: AuditLogQuery, grant: AccessGrant): Promise<AuditLogPage> {
    // A trilha não se recorta por unidade: consultá-la exige escopo de empresa.
    assertCompanyWide(grant);

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      occurredAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      },
    };
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      where.OR = [
        { occurredAt: { lt: cursor.occurredAt } },
        { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
      ];
    }

    const rows = await this.db.client.auditLog.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row): AuditLog => ({
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        actorUserId: row.actorUserId,
        actorIp: row.actorIp,
        requestId: row.requestId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        metadata: row.metadata ?? null,
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }
}
