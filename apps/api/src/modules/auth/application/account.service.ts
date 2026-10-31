import { HttpStatus, Injectable } from '@nestjs/common';
import { type AuthUser, ProblemType } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import type { AuthPrincipal } from '../domain/auth-principal';
import { PasswordHasher } from '../infrastructure/password-hasher';
import { AuthService } from './auth.service';

/**
 * Nome e e-mail de login do próprio usuário (Meu perfil). Trocar o e-mail pede a senha atual:
 * é o que dá acesso à conta e por onde chega o "esqueci minha senha". O e-mail do cadastro de
 * funcionário acompanha quando era o mesmo da conta.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async update(
    principal: AuthPrincipal,
    input: { name: string; email: string; currentPassword?: string | undefined },
  ): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: principal.userId, companyId: principal.companyId, isActive: true },
      select: { id: true, companyId: true, name: true, email: true, passwordHash: true },
    });
    if (!user)
      throw new ProblemException({
        type: ProblemType.Unauthenticated,
        title: 'Unauthorized',
        status: HttpStatus.UNAUTHORIZED,
      });

    const email = input.email.toLowerCase();
    const emailChanged = email !== user.email.toLowerCase();
    if (emailChanged) {
      if (!(await this.hasher.verify(user.passwordHash, input.currentPassword ?? ''))) {
        throw new ProblemException({
          type: ProblemType.WrongPassword,
          title: 'Bad Request',
          status: HttpStatus.BAD_REQUEST,
          detail: 'Para trocar o e-mail, confirme a sua senha atual.',
          errors: [{ path: 'currentPassword', message: 'Senha atual incorreta' }],
        });
      }
      const taken = await this.prisma.user.count({ where: { email, id: { not: user.id } } });
      if (taken > 0) {
        throw new ProblemException({
          type: ProblemType.UniqueViolation,
          title: 'Conflict',
          status: HttpStatus.CONFLICT,
          detail: 'Já existe uma conta com este e-mail.',
          errors: [{ path: 'email', message: 'E-mail já usado em outra conta' }],
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { name: input.name, email } }),
      ...(emailChanged
        ? [
            this.prisma.employee.updateMany({
              where: { companyId: user.companyId, userId: user.id, email: user.email },
              data: { email },
            }),
          ]
        : []),
    ]);
    await this.audit.record({
      action: 'auth.account_updated',
      resourceType: 'user',
      resourceId: user.id,
      companyId: user.companyId,
      actorUserId: user.id,
      // Sem os valores: só o que mudou.
      metadata: { nameChanged: input.name !== user.name, emailChanged },
    });
    return this.auth.me(principal);
  }
}
