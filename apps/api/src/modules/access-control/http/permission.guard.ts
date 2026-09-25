import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemType } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { AuthPrincipal } from '../../auth/domain/auth-principal';
import { IS_PUBLIC } from '../../auth/http/auth.decorators';
import { AccessResolver } from '../application/access-resolver.service';
import {
  ACCESS_REQUIREMENT,
  type AccessRequirement,
  type RequestWithAccess,
} from './access.decorators';

function forbidden(type: string, detail: string): ProblemException {
  return new ProblemException({ type, title: 'Forbidden', status: HttpStatus.FORBIDDEN, detail });
}

/**
 * Guard global de autorização. Roda depois do AuthGuard e nega por padrão: toda rota não
 * pública precisa declarar `@RequirePermission(...)` ou `@AnyAuthenticated()`. A decisão
 * vem das permissões e escopos gravados nos perfis, nunca do nome do perfil (regra 6).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: AccessResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context
      .switchToHttp()
      .getRequest<RequestWithAccess & { principal?: AuthPrincipal }>();
    const requirement = this.reflector.getAllAndOverride<AccessRequirement | undefined>(
      ACCESS_REQUIREMENT,
      targets,
    );
    if (!requirement) {
      this.logger.error(
        {
          route: `${request.method} ${String((request.route as { path?: string } | undefined)?.path)}`,
        },
        'Rota sem requisito de acesso declarado; negando por padrão',
      );
      throw forbidden(ProblemType.Forbidden, 'Acesso negado.');
    }

    const principal = request.principal;
    if (!principal) throw forbidden(ProblemType.Forbidden, 'Acesso negado.');

    // Tokens de MFA só entram em rotas que não exigem permissão específica.
    if (principal.tokenType !== 'access') {
      if (requirement.kind !== 'authenticated')
        throw forbidden(ProblemType.Forbidden, 'Acesso negado.');
      request.access = { userId: principal.userId, companyId: principal.companyId };
      return true;
    }

    const access = await this.resolver.resolve(principal.userId, principal.companyId);
    if (!access?.isActive) {
      throw new ProblemException(
        {
          type: ProblemType.Unauthenticated,
          title: 'Unauthorized',
          status: HttpStatus.UNAUTHORIZED,
        },
        { 'WWW-Authenticate': 'Bearer' },
      );
    }

    // Perfil passou a exigir MFA depois do login: só libera o cadastro do MFA.
    const pendingMfa = access.mfaRequired && !access.mfaEnabled;
    if (pendingMfa && !(requirement.kind === 'authenticated' && requirement.allowPendingMfa)) {
      throw forbidden(
        ProblemType.MfaSetupRequired,
        'Seu perfil exige MFA. Ative-o para continuar.',
      );
    }

    const base = { userId: principal.userId, companyId: principal.companyId, access };
    if (requirement.kind === 'authenticated') {
      request.access = base;
      return true;
    }

    const scope = access.permissions.get(requirement.permission);
    if (!scope)
      throw forbidden(ProblemType.Forbidden, 'Você não tem permissão para esta operação.');
    request.access = { ...base, permission: requirement.permission, scope };
    return true;
  }
}
