import type { Permission } from '@excellence/shared';
import {
  BriefcaseIcon,
  Building2Icon,
  HandshakeIcon,
  HomeIcon,
  type LucideIcon,
  MapPinIcon,
  NetworkIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  PartyPopperIcon,
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
  { label: 'Minha escala', to: '/minha-escala', icon: CalendarDaysIcon },
  { label: 'Funcionários', to: '/pessoas', icon: UserRoundIcon, permission: 'employees:read' },
  { label: 'Unidades', to: '/cadastros/unidades', icon: MapPinIcon, permission: 'units:read' },
  {
    label: 'Departamentos',
    to: '/cadastros/departamentos',
    icon: NetworkIcon,
    permission: 'departments:read',
  },
  { label: 'Cargos', to: '/cadastros/cargos', icon: BriefcaseIcon, permission: 'positions:read' },
  {
    label: 'Sindicatos',
    to: '/cadastros/sindicatos',
    icon: HandshakeIcon,
    permission: 'unions:read',
  },
  { label: 'Turnos', to: '/jornada/turnos', icon: CalendarClockIcon, permission: 'schedules:read' },
  {
    label: 'Escalas',
    to: '/jornada/escalas',
    icon: CalendarRangeIcon,
    permission: 'schedules:read',
  },
  {
    label: 'Feriados',
    to: '/jornada/feriados',
    icon: PartyPopperIcon,
    permission: 'schedules:read',
  },
  { label: 'Empresa', to: '/empresa', icon: Building2Icon, permission: 'company:manage' },
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
