import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../../config/app-config';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Client do Prisma (driver adapter `pg`). A conexão abre na primeira consulta.
 * O isolamento por company_id + escopo entra como Client Extension na etapa 0.4.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL') }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
