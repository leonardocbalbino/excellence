import { randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ProblemType } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import { AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import type { AuthPrincipal } from '../domain/auth-principal';
import { PasswordHasher } from '../infrastructure/password-hasher';
import { RefreshTokenService } from '../infrastructure/refresh-token.service';

// Sem caracteres ambíguos (0/O, 1/l/I), para ditar ou digitar sem erro.
const TEMPORARY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Senha temporária de 12 caracteres (~68 bits), para a primeira entrada do funcionário. */
export function generateTemporaryPassword(length = 12): string {
  return Array.from(
    { length },
    () => TEMPORARY_ALPHABET[randomInt(TEMPORARY_ALPHABET.length)],
  ).join('');
}

@Injectable()
export class PasswordService {
  private readonly minLength: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
    config: AppConfig,
  ) {
    this.minLength = config.get('PASSWORD_MIN_LENGTH');
  }

  /**
   * Troca a senha do próprio usuário. Encerra as outras sessões (mantém a atual) e libera o
   * acesso de quem estava com senha temporária.
   */
  async change(
    principal: AuthPrincipal,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: principal.userId, companyId: principal.companyId, isActive: true },
    });
    if (!user || !(await this.hasher.verify(user.passwordHash, currentPassword))) {
      throw new ProblemException({
        type: ProblemType.WrongPassword,
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: 'A senha atual não confere.',
        errors: [{ path: 'currentPassword', message: 'Senha atual incorreta' }],
      });
    }
    this.assertAcceptable(newPassword, currentPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.hasher.hash(newPassword), mustChangePassword: false },
    });
    await this.refreshTokens.revokeOtherSessions(user.id, principal.sessionId);
    await this.audit.record({
      action: 'auth.password_changed',
      resourceType: 'user',
      resourceId: user.id,
      companyId: user.companyId,
      actorUserId: user.id,
    });
  }

  /**
   * Política mínima de senha. O tamanho é parâmetro (PASSWORD_MIN_LENGTH); demais regras
   * dependem da pendência P-002.
   */
  assertAcceptable(password: string, previous?: string): void {
    const problems: string[] = [];
    if (password.length < this.minLength)
      problems.push(`Use pelo menos ${this.minLength} caracteres`);
    if (previous !== undefined && password === previous)
      problems.push('A nova senha deve ser diferente da atual');
    if (problems.length > 0) {
      throw new ProblemException({
        type: ProblemType.WeakPassword,
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        detail: problems.join('. '),
        errors: problems.map((message) => ({ path: 'newPassword', message })),
      });
    }
  }
}
