import type { DataScope } from '../../access-control/domain/data-scope';

export interface Audience {
  unitIds: readonly string[];
  departmentIds: readonly string[];
}

export function isCompanyWide(audience: Audience): boolean {
  return audience.unitIds.length === 0 && audience.departmentIds.length === 0;
}

/**
 * Quem pode falar com esse público: escopo da empresa inteira fala com qualquer um; escopo de
 * unidade ou departamento só com públicos contidos nele (e nunca com a empresa toda). Equipe
 * e próprios registros não delimitam um público.
 */
export function canAddress(scope: DataScope, audience: Audience): boolean {
  if (scope.companyWide) return true;
  if (isCompanyWide(audience)) return false;
  return (
    audience.unitIds.every((id) => scope.unitIds.includes(id)) &&
    audience.departmentIds.every((id) => scope.departmentIds.includes(id))
  );
}

/** Um funcionário lotado aqui faz parte do público? */
export function reaches(
  audience: Audience,
  placement: { unitId: string; departmentId: string | null } | null,
): boolean {
  if (isCompanyWide(audience)) return true;
  if (!placement) return false;
  return (
    audience.unitIds.includes(placement.unitId) ||
    (placement.departmentId !== null && audience.departmentIds.includes(placement.departmentId))
  );
}
