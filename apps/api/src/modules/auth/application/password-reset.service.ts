import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PASSWORD_RESET_MINUTES, ProblemType } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { MailSender } from '../../notifications/application/mail-sender';
import { passwordResetEmail } from '../domain/password-reset-email';
import { PasswordHasher } from '../infrastructure/password-hasher';
import { RefreshTokenService } from '../infrastructure/refresh-token.service';
import { PasswordService } from './password.service';

/** Links pedidos por conta em uma hora; acima disso, o pedido é ignorado em silêncio. */
const MAX_REQUESTS_PER_HOUR = 3;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * "Esqueci minha senha": o link vai por e-mail, vale PASSWORD_RESET_MINUTES e uma vez só. O
 * pedido responde igual exista ou não o e-mail (não revela quem tem conta). Redefinir encerra
 * todas as sessões e libera quem estava com senha temporária.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
    private readonly mail: MailSender,
  ) {}

  async request(email: string, ip: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, companyId: true, name: true, email: true, isActive: true },
    });
    if (!user?.isActive) return;
    const recent = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    });
    if (recent >= MAX_REQUESTS_PER_HOUR) return;

    const token = randomBytes(32).toString('base64url');
    const link = this.mail.link(`/redefinir-senha?token=${token}`);
    if (!link) {
      this.logger.warn('WEB_APP_URL não configurado: link de redefinição não enviado.');
      return;
    }
    await this.prisma.passwordResetToken.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_MINUTES * 60_000),
        requestedIp: ip,
      },
    });
    const message = passwordResetEmail({ name: user.name, link });
    const result = await this.mail.send({ to: [user.email], ...message });
    if (!result.sent) this.logger.warn(`Link de redefinição não enviado: ${result.error}`);
    await this.audit.record({
      action: 'auth.password_reset_requested',
      resourceType: 'user',
      resourceId: user.id,
      companyId: user.companyId,
      actorUserId: user.id,
      metadata: { emailed: result.sent },
    });
  }

  async reset(token: string, newPassword: string): Promise<void> {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        companyId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { isActive: true } },
      },
    });
    if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) {
      throw new ProblemException({
        type: ProblemType.InvalidReference,
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".',
        errors: [{ path: 'token', message: 'Link expirado ou já usado' }],
      });
    }
    this.passwords.assertAcceptable(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash: await this.hasher.hash(newPassword), mustChangePassword: false },
      }),
      // Este link e qualquer outro pendente da mesma conta deixam de valer.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.refreshTokens.revokeOtherSessions(row.userId, undefined);
    await this.audit.record({
      action: 'auth.password_reset',
      resourceType: 'user',
      resourceId: row.userId,
      companyId: row.companyId,
      actorUserId: row.userId,
    });
  }
}
