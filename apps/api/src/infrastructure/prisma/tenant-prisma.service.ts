import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context';
import { PrismaService } from './prisma.service';
import { applyTenantIsolation } from './tenant-isolation';

function createTenantClient(prisma: PrismaService) {
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const { companyId } = RequestContext.require();
          return query(applyTenantIsolation(model, operation, args, companyId));
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof createTenantClient>;

/**
 * Client do Prisma isolado pela empresa do usuário autenticado (regra 1). É o client que os
 * módulos de negócio devem usar. O `PrismaService` sem filtro fica restrito a
 * infraestrutura, autenticação e jobs que definem a empresa explicitamente.
 *
 * O filtro de escopo (unidades, departamentos, equipe) não é automático: cada repositório
 * aplica o `DataScope` da permissão verificada (ADR 0007).
 */
@Injectable()
export class TenantPrismaService {
  readonly client: TenantClient;

  constructor(prisma: PrismaService) {
    this.client = createTenantClient(prisma);
  }
}
