import { createHash } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProblemType } from '@excellence/shared';
import type { Request, Response } from 'express';
import { catchError, concatMap, from, type Observable, of, throwError } from 'rxjs';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ProblemException } from '../errors/problem.exception';

export const IDEMPOTENT = 'idempotency:enabled';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * A rota aceita o header `Idempotency-Key` (regra 5): repetir a requisição com a mesma
 * chave devolve a mesma resposta, sem repetir o efeito (ex.: marcação de ponto reenviada
 * após falha de rede, fila offline do app).
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);

// Resposta ainda sendo produzida pela primeira requisição.
const IN_PROGRESS = 0;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

function problem(status: number, detail: string): ProblemException {
  return new ProblemException({
    type: ProblemType.IdempotencyMismatch,
    title: status === 409 ? 'Conflict' : 'Unprocessable Entity',
    status,
    detail,
  });
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    if (
      !this.reflector.getAllAndOverride<boolean>(IDEMPOTENT, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return next.handle();
    }
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { access?: { userId: string; companyId: string } }>();
    const response = http.getResponse<Response>();
    const header = request.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(header) ? header[0] : header;
    const access = request.access;
    if (!key || !access) return next.handle();
    if (!KEY_PATTERN.test(key)) {
      throw problem(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Idempotency-Key inválida (8 a 200 caracteres: letras, números, . _ : -).',
      );
    }

    const route = `${request.method} ${String((request.route as { path?: string } | undefined)?.path)}`;
    const requestHash = createHash('sha256')
      .update(`${route}\n${request.originalUrl}\n${JSON.stringify(request.body ?? null)}`)
      .digest('hex');
    const where = {
      companyId_userId_key: { companyId: access.companyId, userId: access.userId, key },
    };

    return from(this.reserve(access, key, route, requestHash)).pipe(
      concatMap((stored) => {
        if (stored) {
          if (stored.requestHash !== requestHash) {
            throw problem(
              HttpStatus.UNPROCESSABLE_ENTITY,
              'Esta Idempotency-Key já foi usada com outra requisição.',
            );
          }
          if (stored.responseStatus === IN_PROGRESS) {
            throw problem(
              HttpStatus.CONFLICT,
              'Requisição com esta Idempotency-Key ainda em processamento.',
            );
          }
          response.status(stored.responseStatus);
          response.setHeader('Idempotent-Replayed', 'true');
          return of(stored.responseBody);
        }
        return next.handle().pipe(
          concatMap((body: unknown) =>
            from(
              this.prisma.idempotencyKey.update({
                where,
                data: {
                  responseStatus: response.statusCode,
                  responseBody: (body ?? null) as Prisma.InputJsonValue,
                },
              }),
            ).pipe(concatMap(() => of(body))),
          ),
          // Falhou: libera a chave para uma nova tentativa.
          catchError((error: unknown) =>
            from(this.prisma.idempotencyKey.delete({ where }).catch(() => undefined)).pipe(
              concatMap(() => throwError(() => error)),
            ),
          ),
        );
      }),
    );
  }

  /** Reserva a chave; se já existir, devolve o registro guardado. */
  private async reserve(
    access: { userId: string; companyId: string },
    key: string,
    route: string,
    requestHash: string,
  ) {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          companyId: access.companyId,
          userId: access.userId,
          key,
          route,
          requestHash,
          responseStatus: IN_PROGRESS,
          responseBody: {},
        },
      });
      return null;
    } catch {
      return this.prisma.idempotencyKey.findUnique({
        where: {
          companyId_userId_key: { companyId: access.companyId, userId: access.userId, key },
        },
      });
    }
  }
}
