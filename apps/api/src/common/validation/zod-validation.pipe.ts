import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ProblemType, type ProblemFieldError } from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../errors/problem.exception';

export function fieldErrorsFrom(error: z.ZodError): ProblemFieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/**
 * Valida e transforma a entrada com um schema Zod (normalmente de `@excellence/shared`).
 * Se falhar, responde 400 com `errors[]` campo a campo.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ProblemException({
      type: ProblemType.Validation,
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      detail: 'A requisição contém campos inválidos.',
      errors: fieldErrorsFrom(result.error),
    });
  }
}
