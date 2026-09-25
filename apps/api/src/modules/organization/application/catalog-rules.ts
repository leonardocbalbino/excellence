import { HttpStatus } from '@nestjs/common';
import { ProblemType } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';

/** Referência a outro cadastro que não existe nesta empresa (ex.: unidade de um departamento). */
export function invalidReference(path: string, detail: string): ProblemException {
  return new ProblemException({
    type: ProblemType.InvalidReference,
    title: 'Unprocessable Entity',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail,
    errors: [{ path, message: detail }],
  });
}

/** Cadastro em uso não pode ser excluído; a alternativa é inativá-lo. */
export function inUse(detail: string): ProblemException {
  return new ProblemException({
    type: ProblemType.InUse,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail: `${detail} Inative o cadastro em vez de excluí-lo.`,
  });
}

/** Valor duplicado em campo único (ex.: código da unidade), apontando o campo. */
export function duplicated(path: string, detail: string): ProblemException {
  return new ProblemException({
    type: ProblemType.UniqueViolation,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail,
    errors: [{ path, message: detail }],
  });
}
