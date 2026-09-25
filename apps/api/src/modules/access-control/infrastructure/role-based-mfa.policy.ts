import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { MfaPolicy } from '../../auth/domain/mfa-policy';

/** MFA obrigatório quando algum perfil do usuário tem `requires_mfa` (ADR 0006). */
@Injectable()
export class RoleBasedMfaPolicy implements MfaPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async isMfaRequired(user: { id: string; companyId: string }): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { userId: user.id, companyId: user.companyId, role: { requiresMfa: true } },
    });
    return count > 0;
  }
}
