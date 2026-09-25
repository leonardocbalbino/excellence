import { HttpStatus } from '@nestjs/common';
import { ProblemType } from '@excellence/shared';
import type { ProblemInit } from './problem.exception';

interface PrismaKnownError {
  name: 'PrismaClientKnownRequestError';
  code: string;
}

// Checagem estrutural para não acoplar este módulo ao client gerado.
export function isPrismaKnownError(error: unknown): error is PrismaKnownError {
  return (
    error instanceof Error &&
    error.name === 'PrismaClientKnownRequestError' &&
    typeof (error as Partial<PrismaKnownError>).code === 'string'
  );
}

/** Converte erros conhecidos do Prisma em Problem Details. Retorna undefined para os demais. */
export function problemFromPrismaError(error: PrismaKnownError): ProblemInit | undefined {
  switch (error.code) {
    case 'P2002':
      return {
        type: ProblemType.UniqueViolation,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'Já existe um registro com estes dados.',
      };
    case 'P2003':
      return {
        type: ProblemType.ReferenceViolation,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'O registro referencia ou é referenciado por outro registro.',
      };
    case 'P2025':
      return {
        title: 'Not Found',
        status: HttpStatus.NOT_FOUND,
        detail: 'Registro não encontrado.',
      };
    default:
      return undefined;
  }
}
