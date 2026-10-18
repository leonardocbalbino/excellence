/**
 * Turnos e escalas são de um posto (condomínio) ou gerais da empresa (`unitId` nulo), ADR
 * 0020. Num posto valem os cadastros dele e os gerais.
 */
export function catalogWhere(unitId: string | undefined): { OR?: { unitId: string | null }[] } {
  return unitId ? { OR: [{ unitId }, { unitId: null }] } : {};
}

/** O cadastro do posto `owner` (ou geral, se nulo) pode ser usado no posto `unitId`? */
export function usableIn(owner: string | null, unitId: string | null): boolean {
  return owner === null || owner === unitId;
}
