import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { PERMISSIONS } from '@excellence/shared';
import type { Request } from 'express';
import { concatMap, from, map, type Observable } from 'rxjs';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../application/audit.service';

const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Regra 7: toda leitura feita com permissão sensível gera audit_log. O registro é gravado
 * antes de a resposta sair; se a auditoria falhar, os dados não são entregues (falha fechado).
 */
@Injectable()
export class SensitiveReadAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<Request & { access?: AccessGrant; id?: unknown }>();
    const grant = request.access;
    const permission = grant?.permission;
    if (
      !grant ||
      !permission ||
      !READ_METHODS.has(request.method) ||
      !PERMISSIONS[permission].sensitive
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      concatMap((body: unknown) =>
        from(
          this.audit.record({
            action: 'sensitive_data.read',
            resourceType: 'route',
            resourceId: `${request.method} ${String((request.route as { path?: string } | undefined)?.path)}`,
            companyId: grant.companyId,
            actorUserId: grant.userId,
            actorIp: request.ip ?? null,
            requestId: typeof request.id === 'string' ? request.id : null,
            // Parâmetros identificam o que foi lido; os valores retornados nunca são gravados.
            metadata: toAuditJson({ permission, params: request.params, query: request.query }),
          }),
        ).pipe(map(() => body)),
      ),
    );
  }
}
