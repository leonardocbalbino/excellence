import { HttpException } from '@nestjs/common';
import type { ProblemDetails } from '@excellence/shared';

export type ProblemInit = Omit<ProblemDetails, 'type' | 'instance' | 'requestId'> & {
  type?: ProblemDetails['type'];
};

/**
 * Exceção que já carrega o Problem Details (RFC 7807) completo.
 * `instance` e `requestId` são preenchidos pelo filtro global.
 */
export class ProblemException extends HttpException {
  constructor(readonly problem: ProblemInit) {
    super(problem, problem.status);
  }
}
