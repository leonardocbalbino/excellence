/** Aba da pasta do posto onde fica cada cadastro (ver unit-editor-page). */
export type FolderTab = 'funcionarios' | 'escalas' | 'valores' | 'resumo' | 'rondas' | 'dados';

export function unitFolderPath(unitId: string, tab: FolderTab): string {
  return `/cadastros/postos/${unitId}?aba=${tab}`;
}
