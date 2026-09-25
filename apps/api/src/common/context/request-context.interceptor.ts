import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { RequestContext } from './request-context';

interface PrincipalLike {
  userId: string;
  companyId: string;
  tokenType: string;
}

/**
 * Abre o contexto da requisição para quem chega com token de acesso. Roda depois dos
 * guards, que já validaram o token e deixaram o principal na requisição.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<Request & { principal?: PrincipalLike; id?: unknown }>();
    const principal = request.principal;
    if (principal?.tokenType !== 'access') return next.handle();

    const data = {
      companyId: principal.companyId,
      userId: principal.userId,
      requestId: typeof request.id === 'string' ? request.id : undefined,
      ip: request.ip,
    };
    return new Observable((subscriber) =>
      RequestContext.run(data, () => next.handle().subscribe(subscriber)),
    );
  }
}
