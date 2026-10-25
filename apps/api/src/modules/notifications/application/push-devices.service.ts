import { Injectable } from '@nestjs/common';
import type { pushDeviceInputSchema } from '@excellence/shared';
import type { z } from 'zod';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';

type DeviceInput = z.output<typeof pushDeviceInputSchema>;

/**
 * Aparelhos que recebem push. O token é do aparelho, não da pessoa: se outra conta entrar no
 * mesmo celular, o token passa para ela (e para de receber o da anterior). Usa o client sem
 * filtro porque o token pode vir de outra empresa; a empresa vai explícita.
 */
@Injectable()
export class PushDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: DeviceInput, grant: AccessGrant): Promise<void> {
    const owner = { companyId: grant.companyId, userId: grant.userId, platform: input.platform };
    await this.prisma.pushDevice.upsert({
      where: { token: input.token },
      update: { ...owner, lastSeenAt: new Date() },
      create: { ...owner, token: input.token },
    });
  }

  /** Só o dono do token o remove (ao sair do app). */
  async unregister(token: string, grant: AccessGrant): Promise<void> {
    await this.prisma.pushDevice.deleteMany({
      where: { token, userId: grant.userId, companyId: grant.companyId },
    });
  }
}
