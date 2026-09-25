import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ProblemDetails, ProblemType } from '@excellence/shared';
import type { Request, Response } from 'express';
import { isPrismaKnownError, problemFromPrismaError } from './prisma-errors';
import { ProblemException, type ProblemInit } from './problem.exception';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

function titleFor(status: number): string {
  return STATUS_CODES[status] ?? 'Error';
}

function internalError(): ProblemInit {
  return { title: titleFor(500), status: HttpStatus.INTERNAL_SERVER_ERROR };
}

/** Extrai o `detail` de uma HttpException do Nest (string ou `{ message }`). */
function detailFromHttpException(exception: HttpException): string | undefined {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((m) => typeof m === 'string').join('; ');
  return undefined;
}

export function toProblem(exception: unknown): ProblemInit {
  if (exception instanceof ProblemException) return exception.problem;

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const title = titleFor(status);
    const detail = detailFromHttpException(exception);
    // Não repete o título como detail (ex.: NotFoundException sem mensagem).
    return detail && detail !== title ? { title, status, detail } : { title, status };
  }

  if (isPrismaKnownError(exception)) {
    return problemFromPrismaError(exception) ?? internalError();
  }

  return internalError();
}

/**
 * Converte qualquer exceção em resposta RFC 7807 (`application/problem+json`).
 * Erros 5xx são logados com stack. A mensagem interna nunca chega ao cliente.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();

    const problem = toProblem(exception);
    const body: ProblemDetails = {
      ...problem,
      type: problem.type ?? ProblemType.Default,
      instance: request.originalUrl.split('?')[0],
      ...(typeof request.id === 'string' ? { requestId: request.id } : {}),
    };

    if (body.status >= 500) {
      this.logger.error(
        { err: exception, requestId: body.requestId },
        exception instanceof Error ? exception.message : 'Erro não tratado',
      );
    }

    if (response.headersSent) return;
    response.status(body.status).type(PROBLEM_CONTENT_TYPE).json(body);
  }
}
