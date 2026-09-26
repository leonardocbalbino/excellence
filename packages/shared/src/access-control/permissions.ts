import { z } from 'zod';

interface PermissionDefinition {
  description: string;
  /**
   * Dá acesso a dados sensíveis (ex.: CID de atestado, histórico disciplinar). Toda leitura
   * com essa permissão gera audit_log.
   */
  sensitive: boolean;
}

/**
 * Catálogo de permissões atômicas no formato `recurso:ação`. É a fonte da verdade: a API
 * sincroniza a tabela `permissions` com ele ao iniciar, e o web o usa para exibir menus e
 * rotas. Cada etapa acrescenta as permissões do seu módulo.
 */
export const PERMISSIONS = {
  'company:manage': { description: 'Configurar os dados da empresa', sensitive: false },
  'roles:read': { description: 'Ver perfis, permissões e escopos', sensitive: false },
  'roles:manage': { description: 'Criar, editar e excluir perfis', sensitive: false },
  'users:read': { description: 'Ver usuários e seus perfis', sensitive: false },
  'users:manage': { description: 'Atribuir perfis a usuários', sensitive: false },
  'units:read': { description: 'Ver unidades', sensitive: false },
  'units:manage': { description: 'Cadastrar e editar unidades', sensitive: false },
  'departments:read': { description: 'Ver departamentos', sensitive: false },
  'departments:manage': { description: 'Cadastrar e editar departamentos', sensitive: false },
  'positions:read': { description: 'Ver cargos', sensitive: false },
  'positions:manage': { description: 'Cadastrar e editar cargos', sensitive: false },
  'unions:read': { description: 'Ver sindicatos', sensitive: false },
  'unions:manage': { description: 'Cadastrar e editar sindicatos', sensitive: false },
  'employees:read': { description: 'Ver funcionários', sensitive: false },
  'employees:manage': {
    description: 'Cadastrar e editar funcionários e criar contas de acesso',
    sensitive: false,
  },
  'employees:import': { description: 'Importar funcionários por planilha', sensitive: false },
  'schedules:read': { description: 'Ver turnos, escalas e feriados', sensitive: false },
  'schedules:manage': { description: 'Cadastrar turnos, escalas e feriados', sensitive: false },
  'schedules:assign': {
    description: 'Vincular funcionários às escalas',
    sensitive: false,
  },
  'time_entries:read': { description: 'Ver marcações e espelho de ponto', sensitive: false },
  'time_entries:manage': {
    description: 'Solicitar ajustes de ponto em nome de funcionários',
    sensitive: false,
  },
  'time_adjustments:approve': {
    description: 'Aprovar ou recusar ajustes de ponto',
    sensitive: false,
  },
  'medical_certificates:read': {
    description: 'Ver atestados (período e situação, sem CID)',
    sensitive: false,
  },
  'medical_certificates:read_sensitive': {
    description: 'Ver o CID e o documento dos atestados',
    sensitive: true,
  },
  'medical_certificates:manage': {
    description: 'Registrar atestados em nome de funcionários',
    sensitive: false,
  },
  'medical_certificates:review': {
    description: 'Aceitar ou recusar atestados',
    sensitive: false,
  },
  'announcements:manage': {
    description: 'Escrever, publicar e arquivar comunicados e ver quem leu',
    sensitive: false,
  },
  // A trilha de auditoria revela quem acessou dados sensíveis: sua leitura também é auditada.
  'audit:read': { description: 'Consultar a trilha de auditoria', sensitive: true },
} as const satisfies Record<string, PermissionDefinition>;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as [Permission, ...Permission[]];

export const permissionSchema = z.enum(PERMISSION_KEYS);

export function isPermission(value: string): value is Permission {
  return Object.hasOwn(PERMISSIONS, value);
}

/**
 * Escopo de dados de um perfil. Um perfil pode ter vários escopos; o acesso é a união deles.
 * - `company`: todos os dados da empresa;
 * - `unit` / `department`: dados de uma unidade ou departamento específico;
 * - `own_team`: dados da equipe que o usuário gerencia;
 * - `self`: só os próprios dados.
 */
export const scopeTypeSchema = z.enum(['company', 'unit', 'department', 'own_team', 'self']);
export type ScopeType = z.infer<typeof scopeTypeSchema>;

export const roleScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('company') }),
  z.object({ type: z.literal('unit'), unitId: z.uuid() }),
  z.object({ type: z.literal('department'), departmentId: z.uuid() }),
  z.object({ type: z.literal('own_team') }),
  z.object({ type: z.literal('self') }),
]);
export type RoleScope = z.infer<typeof roleScopeSchema>;
