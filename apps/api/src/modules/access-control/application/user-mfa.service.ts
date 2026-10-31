import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { isPermission, ProblemType, type UserWithRoles } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import type { AccessGrant } from '../http/access.decorators';
import { assertCompanyWide } from './access-rules';

/**
 * Redefinição do MFA de outro usuário por RH/Admin (ex.: perdeu o celular). Apaga o segredo e
 * os códigos de recuperação e encerra as sessões; no próximo login, se o perfil exigir MFA, o
 * usuário cadastra o autenticador de novo.
 *
 * Contra tomada de conta: ninguém redefine o próprio MFA por aqui (use "Segurança da conta") nem
 * o de quem tem permissões que ele não tem (o RH não redefine o do Administrador).
 */
@Injectable()
export class UserMfaService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async reset(userId: string, grant: AccessGrant): Promise<UserWithRoles> {
    assertCompanyWide(grant);
    if (userId === grant.userId) {
      throw new ProblemException({
        type: ProblemType.OwnMfaReset,
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Para trocar o seu próprio autenticador, use "Segurança da conta".',
      });
    }
    const target = await this.db.client.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        mfaEnabled: true,
        mfaPendingSecret: true,
        userRoles: {
          select: { role: { select: { permissions: { select: { permissionKey: true } } } } },
        },
      },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado.');

    const held = grant.access?.permissions;
    const beyond = [
      ...new Set(
        target.userRoles.flatMap(({ role }) =>
          role.permissions.map((p) => p.permissionKey).filter(isPermission),
        ),
      ),
    ].filter((permission) => !held?.has(permission));
    if (beyond.length > 0) {
      throw new ProblemException({
        type: ProblemType.PrivilegeEscalation,
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail:
          'Este usuário tem permissões que você não possui. Peça a redefinição a um administrador.',
      });
    }
    if (!target.mfaEnabled && !target.mfaPendingSecret) {
      throw new ProblemException({
        type: ProblemType.MfaNotEnabled,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'Este usuário não tem verificação em duas etapas ativa.',
      });
    }

    await this.db.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaPendingSecret: null,
          mfaLastUsedStep: null,
          mfaEnabledAt: null,
        },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      // Quem estava logado precisa entrar de novo (e cadastrar o autenticador).
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'mfa_reset' },
      });
      await this.audit.record(
        {
          action: 'user.mfa_reset',
          resourceType: 'user',
          resourceId: userId,
          metadata: { name: target.name, email: target.email },
        },
        tx,
      );
    });

    const row = await this.db.client.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        mfaEnabled: true,
        userRoles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    const { userRoles, ...user } = row;
    return {
      ...user,
      roles: userRoles.map((ur) => ur.role).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
