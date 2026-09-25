import type { DataScope } from '../../access-control/domain/data-scope';

/** Quem está consultando: o usuário e, se tiver, o próprio registro de funcionário. */
export interface ScopeActor {
  userId: string;
  employeeId: string | null;
}

/** Onde um funcionário está: o que decide se ele cai no escopo de alguém. */
export interface EmployeePlacement {
  id?: string;
  unitId: string;
  departmentId: string | null;
  managerId: string | null;
  userId: string | null;
}

/** Condição de consulta (formato do Prisma) para `employees`. */
export type EmployeeScopeWhere = Record<string, never> | { OR: Record<string, unknown>[] };

/**
 * Traduz o escopo concedido em filtro de funcionários. Cada escopo acrescenta um conjunto; o
 * acesso é a união:
 * - `unit` / `department`: funcionários lotados ali;
 * - `own_team`: liderados diretos (gestor = o registro de funcionário de quem consulta);
 * - `self`: o próprio registro.
 * Devolve `null` quando o escopo não alcança ninguém (a consulta deve voltar vazia).
 */
export function employeeScopeWhere(scope: DataScope, actor: ScopeActor): EmployeeScopeWhere | null {
  if (scope.companyWide) return {};
  const conditions: Record<string, unknown>[] = [];
  if (scope.unitIds.length > 0) conditions.push({ unitId: { in: [...scope.unitIds] } });
  if (scope.departmentIds.length > 0) {
    conditions.push({ departmentId: { in: [...scope.departmentIds] } });
  }
  if (scope.ownTeam && actor.employeeId) conditions.push({ managerId: actor.employeeId });
  if (scope.self) conditions.push({ userId: actor.userId });
  return conditions.length > 0 ? { OR: conditions } : null;
}

/** Mesma regra de `employeeScopeWhere`, avaliada sobre um funcionário em memória. */
export function isInScope(
  scope: DataScope,
  actor: ScopeActor,
  employee: EmployeePlacement,
): boolean {
  if (scope.companyWide) return true;
  if (scope.unitIds.includes(employee.unitId)) return true;
  if (employee.departmentId && scope.departmentIds.includes(employee.departmentId)) return true;
  if (scope.ownTeam && actor.employeeId && employee.managerId === actor.employeeId) return true;
  return scope.self && employee.userId === actor.userId;
}
