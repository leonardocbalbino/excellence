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
 *
 * Permissão nova no catálogo vai também para os perfis que já tinham todas as outras (o
 * Administrador com acesso total). Sem isso, ninguém consegue concedê-la: só concede quem
 * tem (`assertCanGrant`). Perfis que o Administrador restringiu não ganham nada.
 */
export async function syncPermissionCatalog(
  prisma: Pick<PrismaClient, 'permission' | '$transaction' | '$executeRaw'>,
) {
  const entries = Object.entries(PERMISSIONS) as [Permission, (typeof PERMISSIONS)[Permission]][];
  const known = (await prisma.permission.findMany({ select: { key: true } }))
    .map(({ key }) => key)
    .filter((key) => key in PERMISSIONS);
  const added = entries.map(([key]) => key).filter((key) => !known.includes(key));
  await prisma.$transaction(
    entries.map(([key, definition]) =>
      prisma.permission.upsert({
        where: { key },
        create: { key, ...permissionParts(key), ...definition },
        update: { ...permissionParts(key), ...definition },
      }),
    ),
  );
  // Catálogo vazio (banco novo): os perfis ainda não existem, não há o que completar.
  if (added.length > 0 && known.length > 0) {
    await prisma.$executeRaw`
      INSERT INTO "role_permissions" ("company_id", "role_id", "permission_key")
      SELECT r."company_id", r."id", added.key
      FROM "roles" r CROSS JOIN unnest(${added}::text[]) AS added(key)
      WHERE (SELECT count(*) FROM "role_permissions" rp
             WHERE rp."role_id" = r."id" AND rp."permission_key" = ANY(${known}::text[]))
            = ${known.length}
      ON CONFLICT ("role_id", "permission_key") DO NOTHING`;
  }
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
