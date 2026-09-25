import { type Permission, PERMISSION_KEYS, type RoleScope } from '@excellence/shared';

export interface RoleTemplate {
  /** Chave estável do modelo (o nome exibido pode ser renomeado pelo Admin). */
  key: 'admin' | 'hr' | 'manager' | 'employee';
  name: string;
  description: string;
  requiresMfa: boolean;
  permissions: readonly Permission[];
  scopes: readonly RoleScope[];
}

/** Leitura dos cadastros de estrutura, útil para quase todos os perfis de gestão. */
const STRUCTURE_READ: readonly Permission[] = [
  'units:read',
  'departments:read',
  'positions:read',
  'unions:read',
];

/**
 * Perfis criados com cada empresa. São só o ponto de partida: o Administrador pode
 * mudar permissões, escopos e exigência de MFA. O código nunca decide nada pelo nome ou
 * pela chave do perfil; só pelas permissões e escopos gravados.
 *
 * Cada etapa acrescenta aqui as permissões do seu módulo.
 */
export const DEFAULT_ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'admin',
    name: 'Administrador',
    description: 'Configura a empresa, os perfis, as permissões e os escopos.',
    requiresMfa: true,
    permissions: PERMISSION_KEYS,
    scopes: [{ type: 'company' }],
  },
  {
    key: 'hr',
    name: 'RH',
    description: 'Opera o sistema dentro do escopo definido pelo Administrador.',
    requiresMfa: true,
    permissions: [
      'roles:read',
      'users:read',
      ...STRUCTURE_READ,
      'units:manage',
      'departments:manage',
      'positions:manage',
      'unions:manage',
      'employees:read',
      'employees:manage',
      'employees:import',
    ],
    scopes: [{ type: 'company' }],
  },
  {
    key: 'manager',
    name: 'Gestor',
    description: 'Aprova ajustes e ausências da equipe e acompanha rondas.',
    requiresMfa: false,
    permissions: [...STRUCTURE_READ, 'employees:read'],
    scopes: [{ type: 'own_team' }],
  },
  {
    key: 'employee',
    name: 'Funcionário',
    description: 'Bate ponto, envia atestados, faz rondas e consulta normas.',
    requiresMfa: false,
    permissions: [],
    scopes: [{ type: 'self' }],
  },
];
