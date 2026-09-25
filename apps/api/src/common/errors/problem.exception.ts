import { HttpException } from '@nestjs/common';
import type { ProblemDetails } from '@excellence/shared';

export type ProblemInit = Omit<ProblemDetails, 'type' | 'instance' | 'requestId'> & {
  type?: ProblemDetails['type'];
};

/**
 * Exceção que já carrega o Problem Details (RFC 7807) completo.
 * `instance` e `requestId` são preenchidos pelo filtro global. `headers` vão na resposta
 * (ex.: `Retry-After` no 429, `WWW-Authenticate` no 401).
 */
export class ProblemException extends HttpException {
  constructor(
    readonly problem: ProblemInit,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(problem, problem.status);
  }
}
