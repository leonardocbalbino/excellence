import type { RoleScope, ScopeType } from '@excellence/shared';

/** Nomes dos recursos do catálogo de permissões, para agrupar na tela. */
export const RESOURCE_LABELS: Record<string, string> = {
  company: 'Empresa',
  roles: 'Perfis de acesso',
  users: 'Usuários',
  audit: 'Auditoria',
};

export const SCOPE_LABELS: Record<ScopeType, string> = {
  company: 'Toda a empresa',
  unit: 'Unidade',
  department: 'Departamento',
  own_team: 'Equipe que gerencia',
  self: 'Somente os próprios dados',
};

export function describeScope(scope: RoleScope): string {
  switch (scope.type) {
    case 'unit':
      return `${SCOPE_LABELS.unit} ${scope.unitId.slice(0, 8)}…`;
    case 'department':
      return `${SCOPE_LABELS.department} ${scope.departmentId.slice(0, 8)}…`;
    default:
      return SCOPE_LABELS[scope.type];
  }
}
