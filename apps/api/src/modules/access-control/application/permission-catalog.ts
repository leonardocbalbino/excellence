import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type Permission, PERMISSIONS } from '@excellence/shared';
import type { PrismaClient } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export function permissionParts(key: Permission): { resource: string; action: string } {
  const [resource = key, action = ''] = key.split(':');
  return { resource, action };
}

/**
 * Deixa a tabela `permissions` igual ao catálogo do código. É idempotente e seguro com
 * várias instâncias subindo ao mesmo tempo. Permissões removidas do código não são apagadas
 * (podem estar em perfis); só geram aviso.
 */
export async function syncPermissionCatalog(
  prisma: Pick<PrismaClient, 'permission' | '$transaction'>,
) {
  const entries = Object.entries(PERMISSIONS) as [Permission, (typeof PERMISSIONS)[Permission]][];
  await prisma.$transaction(
    entries.map(([key, definition]) =>
      prisma.permission.upsert({
        where: { key },
        create: { key, ...permissionParts(key), ...definition },
        update: { ...permissionParts(key), ...definition },
      }),
    ),
  );
  const stored = await prisma.permission.findMany({ select: { key: true } });
  return stored.map(({ key }) => key).filter((key) => !(key in PERMISSIONS));
}

@Injectable()
export class PermissionCatalogSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionCatalogSync.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const stale = await syncPermissionCatalog(this.prisma);
      if (stale.length > 0)
        this.logger.warn({ stale }, 'Permissões no banco que não existem mais no código');
    } catch (error) {
      // Sem banco no boot, a API sobe mesmo assim; o /health/ready acusa o problema.
      this.logger.error({ err: error }, 'Falha ao sincronizar o catálogo de permissões');
    }
  }
}
