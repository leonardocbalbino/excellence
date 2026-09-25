import { HttpStatus, Injectable } from '@nestjs/common';
import { type MfaSetupResponse, ProblemType } from '@excellence/shared';
import { SecretBox } from '../../../common/crypto/secret-box';
import { sha256 } from '../../../common/crypto/tokens';
import { ProblemException } from '../../../common/errors/problem.exception';
import { AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  generateRecoveryCode,
  generateTotpSecret,
  isRecoveryCodeFormat,
  RECOVERY_CODE_COUNT,
  totpUri,
  verifyTotp,
} from '../domain/totp';

@Injectable()
export class MfaService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    this.box = new SecretBox(config.get('MFA_ENCRYPTION_KEY'));
  }

  /** Gera um segredo pendente. Só vale depois de confirmado em `activate`. */
  async setup(userId: string): Promise<MfaSetupResponse> {
    const user = await this.activeUser(userId);
    if (user.mfaEnabled) throw mfaAlreadyEnabled();

    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaPendingSecret: this.box.seal(secret) },
    });
    return {
      secret,
      otpauthUrl: totpUri(secret, { issuer: this.config.get('MFA_ISSUER'), label: user.email }),
    };
  }

  /** Confirma o segredo pendente com um código válido e gera os códigos de recuperação. */
  async activate(userId: string, code: string): Promise<string[]> {
    const user = await this.activeUser(userId);
    if (user.mfaEnabled) throw mfaAlreadyEnabled();
    if (!user.mfaPendingSecret) {
      throw new ProblemException({
        type: ProblemType.MfaSetupNotStarted,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'Inicie a configuração do MFA antes de ativá-lo.',
      });
    }

    const step = verifyTotp(this.box.open(user.mfaPendingSecret), code, Date.now(), null);
    if (step === null) throw invalidMfaCode();

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          mfaSecret: user.mfaPendingSecret,
          mfaPendingSecret: null,
          mfaLastUsedStep: step,
          mfaEnabledAt: new Date(),
        },
      }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          companyId: user.companyId,
          userId: user.id,
          codeHash: sha256(recoveryCode),
        })),
      }),
    ]);
    return recoveryCodes;
  }

  /**
   * Verifica um código TOTP ou de recuperação e o consome. Os dois são de uso único; o
   * consumo é atômico, então duas requisições com o mesmo código não passam juntas.
   */
  async verifyAndConsume(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive || !user.mfaEnabled || !user.mfaSecret) return false;

    if (isRecoveryCodeFormat(code)) {
      const used = await this.prisma.mfaRecoveryCode.updateMany({
        where: { userId, codeHash: sha256(code), usedAt: null },
        data: { usedAt: new Date() },
      });
      return used.count === 1;
    }

    const step = verifyTotp(this.box.open(user.mfaSecret), code, Date.now(), user.mfaLastUsedStep);
    if (step === null) return false;
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
      data: { mfaLastUsedStep: step },
    });
    return updated.count === 1;
  }

  private async activeUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) {
      throw new ProblemException({ title: 'Unauthorized', status: HttpStatus.UNAUTHORIZED });
    }
    return user;
  }
}

function mfaAlreadyEnabled(): ProblemException {
  return new ProblemException({
    type: ProblemType.MfaAlreadyEnabled,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail: 'O MFA já está ativo para este usuário.',
  });
}

export function invalidMfaCode(): ProblemException {
  return new ProblemException({
    type: ProblemType.InvalidMfaCode,
    title: 'Unauthorized',
    status: HttpStatus.UNAUTHORIZED,
    detail: 'Código inválido ou já utilizado.',
  });
}
