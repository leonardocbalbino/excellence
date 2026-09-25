import type { Permission } from '@excellence/shared';
import {
  HomeIcon,
  type LucideIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Sem permissão: visível para qualquer usuário autenticado. */
  permission?: Permission;
}

/** Itens do menu. Cada módulo acrescenta os seus nas próximas etapas. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Início', to: '/', icon: HomeIcon },
  {
    label: 'Perfis de acesso',
    to: '/acesso/perfis',
    icon: ShieldCheckIcon,
    permission: 'roles:read',
  },
  { label: 'Usuários', to: '/acesso/usuarios', icon: UsersIcon, permission: 'users:read' },
  { label: 'Auditoria', to: '/auditoria', icon: ScrollTextIcon, permission: 'audit:read' },
];

export function visibleNavItems(permissions: readonly Permission[]): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || permissions.includes(item.permission));
}
