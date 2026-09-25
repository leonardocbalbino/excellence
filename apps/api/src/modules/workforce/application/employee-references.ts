import { HttpStatus } from '@nestjs/common';
import { ProblemType, type ProblemFieldError } from '@excellence/shared';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { TenantClient } from '../../../infrastructure/prisma/tenant-prisma.service';

export interface EmployeeReferences {
  unitId: string;
  departmentId: string | null;
  positionId: string | null;
  unionId: string | null;
  managerId: string | null;
}

type Db = Pick<TenantClient, 'unit' | 'department' | 'position' | 'laborUnion' | 'employee'>;

/** Número máximo de níveis percorridos ao procurar ciclos na cadeia de gestores. */
const MAX_MANAGEMENT_DEPTH = 100;

/**
 * Confere as referências de um funcionário dentro da empresa: existem, estão ativas, o
 * departamento pertence à unidade (quando é de uma unidade) e o gestor não cria ciclo.
 * Devolve os problemas por campo (vazio = tudo certo).
 */
export async function checkEmployeeReferences(
  db: Db,
  refs: EmployeeReferences,
  employeeId: string | null,
): Promise<ProblemFieldError[]> {
  const errors: ProblemFieldError[] = [];
  const [unit, department, position, union] = await Promise.all([
    db.unit.findUnique({ where: { id: refs.unitId }, select: { isActive: true } }),
    refs.departmentId
      ? db.department.findUnique({
          where: { id: refs.departmentId },
          select: { isActive: true, unitId: true },
        })
      : null,
    refs.positionId
      ? db.position.findUnique({ where: { id: refs.positionId }, select: { isActive: true } })
      : null,
    refs.unionId
      ? db.laborUnion.findUnique({ where: { id: refs.unionId }, select: { isActive: true } })
      : null,
  ]);

  if (!unit?.isActive)
    errors.push({ path: 'unitId', message: 'Unidade não encontrada ou inativa' });
  if (refs.departmentId) {
    if (!department?.isActive) {
      errors.push({ path: 'departmentId', message: 'Departamento não encontrado ou inativo' });
    } else if (department.unitId && department.unitId !== refs.unitId) {
      errors.push({ path: 'departmentId', message: 'O departamento pertence a outra unidade' });
    }
  }
  if (refs.positionId && !position?.isActive) {
    errors.push({ path: 'positionId', message: 'Cargo não encontrado ou inativo' });
  }
  if (refs.unionId && !union?.isActive) {
    errors.push({ path: 'unionId', message: 'Sindicato não encontrado ou inativo' });
  }
  if (refs.managerId) {
    const problem = await checkManager(db, refs.managerId, employeeId);
    if (problem) errors.push({ path: 'managerId', message: problem });
  }
  return errors;
}

async function checkManager(
  db: Db,
  managerId: string,
  employeeId: string | null,
): Promise<string | null> {
  if (managerId === employeeId) return 'O funcionário não pode ser gestor de si mesmo';
  let current: string | null = managerId;
  for (let depth = 0; current && depth < MAX_MANAGEMENT_DEPTH; depth++) {
    const found: { managerId: string | null } | null = await db.employee.findUnique({
      where: { id: current },
      select: { managerId: true },
    });
    if (!found) return depth === 0 ? 'Gestor não encontrado' : null;
    if (employeeId && found.managerId === employeeId) {
      return 'Esse gestor é liderado (direta ou indiretamente) por este funcionário';
    }
    current = found.managerId;
  }
  return null;
}

export function referenceProblem(errors: ProblemFieldError[]): ProblemException {
  return new ProblemException({
    type: ProblemType.InvalidReference,
    title: 'Unprocessable Entity',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: 'Há referências inválidas no cadastro.',
    errors,
  });
}
