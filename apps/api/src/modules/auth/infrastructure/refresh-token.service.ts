import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { generateOpaqueToken, sha256 } from '../../../common/crypto/tokens';
import { AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/application/audit.service';

export interface ClientMetadata {
  ip: string;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}

export interface IssuedRefreshToken {
  token: string;
  familyId: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
  companyId: string;
}

export type RevokeReason = 'logout' | 'reuse_detected' | 'user_inactive';

export class InvalidRefreshTokenError extends Error {
  constructor(readonly reason: string) {
    super(`Refresh token inválido: ${reason}`);
    this.name = 'InvalidRefreshTokenError';
  }
}

const DAY_MS = 86_400_000;

/**
 * Refresh tokens opacos e rotativos, agrupados por família (uma família por login).
 *
 * - A validade é deslizante: cada rotação emite um token novo com `REFRESH_TOKEN_TTL_DAYS`.
 * - Cada token vale uma vez. Reapresentar um token já consumido indica roubo (o atacante e
 *   o usuário legítimo têm cópias), e a família inteira é revogada.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: AppConfig,
  ) {
    this.ttlMs = config.get('REFRESH_TOKEN_TTL_DAYS') * DAY_MS;
  }

  async issue(
    user: { id: string; companyId: string },
    meta: ClientMetadata,
    familyId: string = randomUUID(),
  ): Promise<IssuedRefreshToken> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await this.prisma.refreshToken.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        familyId,
        tokenHash: sha256(token),
        expiresAt,
        ...this.metadata(meta),
      },
    });
    return { token, familyId, expiresAt };
  }

  async rotate(token: string, meta: ClientMetadata): Promise<RotatedRefreshToken> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { isActive: true } } },
    });
    if (!current) throw new InvalidRefreshTokenError('not_found');
    if (current.revokedAt) throw new InvalidRefreshTokenError('revoked');
    if (current.expiresAt.getTime() <= Date.now()) throw new InvalidRefreshTokenError('expired');
    if (!current.user.isActive) {
      await this.revokeFamily(current.familyId, 'user_inactive');
      throw new InvalidRefreshTokenError('user_inactive');
    }

    const next = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Consome o token de forma atômica: só uma requisição concorrente vence.
      const consumed = await tx.refreshToken.updateMany({
        where: { id: current.id, usedAt: null, revokedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) return false;
      await tx.refreshToken.create({
        data: {
          companyId: current.companyId,
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: sha256(next),
          expiresAt,
          ...this.metadata(meta),
        },
      });
      return true;
    });

    if (!rotated) {
      this.logger.warn(
        { userId: current.userId, familyId: current.familyId, ip: meta.ip },
        'Reuso de refresh token detectado; sessão revogada',
      );
      await this.revokeFamily(current.familyId, 'reuse_detected');
      await this.audit.record({
        action: 'auth.refresh_token_reused',
        resourceType: 'user',
        resourceId: current.userId,
        companyId: current.companyId,
        actorUserId: null,
        actorIp: meta.ip,
        requestId: meta.requestId ?? null,
        metadata: { sessionId: current.familyId, userAgent: meta.userAgent ?? null },
      });
      throw new InvalidRefreshTokenError('reused');
    }

    return {
      token: next,
      familyId: current.familyId,
      expiresAt,
      userId: current.userId,
      companyId: current.companyId,
    };
  }

  /**
   * Revoga a sessão a que o token pertence e devolve de quem era. Token desconhecido é
   * ignorado (logout idempotente).
   */
  async revokeByToken(
    token: string,
    reason: RevokeReason,
  ): Promise<{ userId: string; companyId: string } | null> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      select: { familyId: true, userId: true, companyId: true, revokedAt: true },
    });
    if (!current || current.revokedAt) return null;
    await this.revokeFamily(current.familyId, reason);
    return { userId: current.userId, companyId: current.companyId };
  }

  async revokeFamily(familyId: string, reason: RevokeReason): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private metadata(meta: ClientMetadata) {
    return { ipAddress: meta.ip, userAgent: meta.userAgent?.slice(0, 512) ?? null };
  }
}
