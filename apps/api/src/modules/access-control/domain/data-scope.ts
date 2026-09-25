import type { RoleScope } from '@excellence/shared';

/**
 * Escopo efetivo de uma permissão para um usuário: a união dos escopos de todos os perfis
 * dele que concedem a permissão. Os repositórios traduzem isto em filtros de consulta.
 */
export interface DataScope {
  /** Toda a empresa: dispensa os demais filtros. */
  readonly companyWide: boolean;
  readonly unitIds: readonly string[];
  readonly departmentIds: readonly string[];
  /** Equipe gerida pelo usuário. */
  readonly ownTeam: boolean;
  /** Os próprios registros do usuário. */
  readonly self: boolean;
}

export const EMPTY_SCOPE: DataScope = {
  companyWide: false,
  unitIds: [],
  departmentIds: [],
  ownTeam: false,
  self: false,
};

export function mergeScopes(scopes: Iterable<RoleScope>): DataScope {
  let companyWide = false;
  let ownTeam = false;
  let self = false;
  const unitIds = new Set<string>();
  const departmentIds = new Set<string>();
  for (const scope of scopes) {
    switch (scope.type) {
      case 'company':
        companyWide = true;
        break;
      case 'unit':
        unitIds.add(scope.unitId);
        break;
      case 'department':
        departmentIds.add(scope.departmentId);
        break;
      case 'own_team':
        ownTeam = true;
        break;
      case 'self':
        self = true;
        break;
    }
  }
  if (companyWide) return { ...EMPTY_SCOPE, companyWide: true };
  return { companyWide, unitIds: [...unitIds], departmentIds: [...departmentIds], ownTeam, self };
}

export function isEmptyScope(scope: DataScope): boolean {
  return (
    !scope.companyWide &&
    scope.unitIds.length === 0 &&
    scope.departmentIds.length === 0 &&
    !scope.ownTeam &&
    !scope.self
  );
}

/** Conversão do registro do banco (colunas anuláveis) para o tipo discriminado. */
export function toRoleScope(row: {
  type: RoleScope['type'];
  unitId: string | null;
  departmentId: string | null;
}): RoleScope {
  switch (row.type) {
    case 'unit':
      return { type: 'unit', unitId: row.unitId ?? '' };
    case 'department':
      return { type: 'department', departmentId: row.departmentId ?? '' };
    default:
      return { type: row.type };
  }
}

export function fromRoleScope(scope: RoleScope): {
  type: RoleScope['type'];
  unitId: string | null;
  departmentId: string | null;
} {
  return {
    type: scope.type,
    unitId: scope.type === 'unit' ? scope.unitId : null,
    departmentId: scope.type === 'department' ? scope.departmentId : null,
  };
}
