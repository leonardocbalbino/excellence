import type { MyAccess, Permission } from '@excellence/shared';
import {
  BriefcaseIcon,
  Building2Icon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  ClipboardCheckIcon,
  ClockIcon,
  FileHeartIcon,
  HandshakeIcon,
  HomeIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MapPinIcon,
  MegaphoneIcon,
  MapIcon,
  QrCodeIcon,
  RouteIcon,
  NetworkIcon,
  ScrollTextIcon,
  SendIcon,
  ShieldCheckIcon,
  StethoscopeIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
  GiftIcon,
  LinkIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Sem permissão: visível para qualquer usuário da área. */
  permission?: Permission;
  /** Condição além da permissão (ex.: ter rota de ronda atribuída). */
  when?: (access: MyAccess) => boolean;
  /** Ativo só no endereço exato (quando há subpáginas com item próprio). */
  end?: boolean;
}

export interface NavSection {
  /** Sem título: primeiro bloco do menu. */
  title?: string;
  items: readonly NavItem[];
}

/**
 * Área pessoal: o próprio ponto, escala, atestados e comunicados. Só existe para quem tem
 * cadastro de funcionário (quem só administra não bate ponto).
 */
export const PERSONAL_NAV: readonly NavItem[] = [
  { label: 'Início', to: '/', icon: HomeIcon },
  { label: 'Registrar ponto', to: '/ponto', icon: ClockIcon },
  { label: 'Rondas', to: '/rondas', icon: RouteIcon, when: (access) => access.hasPatrolRoutes },
  { label: 'Escala', to: '/minha-escala', icon: CalendarDaysIcon },
  { label: 'Atestados', to: '/meus-atestados', icon: StethoscopeIcon },
  { label: 'Folha', to: '/minha-folha', icon: WalletIcon },
  { label: 'Benefícios', to: '/beneficios', icon: GiftIcon },
  { label: 'Comunicados', to: '/comunicados', icon: MegaphoneIcon },
];

export const MANAGEMENT_HOME = '/gestao';

/**
 * Área de gestão: dados dos outros funcionários, sempre no escopo do perfil. Cada item
 * exige a permissão do módulo; a Visão geral aparece quando há qualquer outro item.
 */
export const MANAGEMENT_NAV: readonly NavSection[] = [
  {
    title: 'Pessoas e ponto',
    items: [
      {
        label: 'Postos de trabalho',
        to: '/cadastros/postos',
        icon: MapPinIcon,
        permission: 'units:read',
      },
      { label: 'Funcionários', to: '/pessoas', icon: UserRoundIcon, permission: 'employees:read' },
      {
        label: 'Ponto do dia',
        to: '/gestao/ponto',
        icon: ClockIcon,
        permission: 'time_entries:read',
      },
      {
        label: 'Ajustes de ponto',
        to: '/ponto/ajustes',
        icon: ClipboardCheckIcon,
        permission: 'time_adjustments:approve',
      },
      {
        label: 'Atestados',
        to: '/atestados',
        icon: FileHeartIcon,
        permission: 'medical_certificates:read',
      },
    ],
  },
  {
    title: 'Remuneração',
    items: [
      {
        label: 'Folha de pagamento',
        to: '/gestao/folha',
        icon: WalletIcon,
        permission: 'payroll:manage',
      },
      {
        label: 'Benefícios',
        to: '/gestao/beneficios',
        icon: GiftIcon,
        permission: 'benefits:manage',
      },
    ],
  },
  {
    title: 'Rondas',
    items: [
      {
        label: 'Rondas do dia',
        to: '/gestao/rondas',
        icon: RouteIcon,
        permission: 'patrols:read',
        end: true,
      },
      {
        label: 'Rotas',
        to: '/gestao/rondas/rotas',
        icon: MapIcon,
        permission: 'patrols:manage',
      },
      {
        label: 'Pontos e QR codes',
        to: '/gestao/rondas/pontos',
        icon: QrCodeIcon,
        permission: 'patrols:manage',
      },
    ],
  },
  {
    title: 'Jornada',
    items: [
      {
        label: 'Turnos',
        to: '/jornada/turnos',
        icon: CalendarClockIcon,
        permission: 'schedules:read',
      },
      {
        label: 'Escalas',
        to: '/jornada/escalas',
        icon: CalendarRangeIcon,
        permission: 'schedules:read',
      },
      {
        label: 'Feriados',
        to: '/jornada/feriados',
        icon: CalendarDaysIcon,
        permission: 'schedules:read',
      },
    ],
  },
  {
    title: 'Comunicação',
    items: [
      {
        label: 'Gestão de comunicados',
        to: '/gestao/comunicados',
        icon: SendIcon,
        permission: 'announcements:manage',
      },
      {
        label: 'Links úteis',
        to: '/gestao/links',
        icon: LinkIcon,
        permission: 'useful_links:manage',
      },
    ],
  },
  {
    title: 'Cadastros',
    items: [
      {
        label: 'Departamentos',
        to: '/cadastros/departamentos',
        icon: NetworkIcon,
        permission: 'departments:read',
      },
      {
        label: 'Cargos',
        to: '/cadastros/cargos',
        icon: BriefcaseIcon,
        permission: 'positions:read',
      },
      {
        label: 'Sindicatos',
        to: '/cadastros/sindicatos',
        icon: HandshakeIcon,
        permission: 'unions:read',
      },
    ],
  },
  {
    title: 'Administração',
    items: [
      { label: 'Empresa', to: '/empresa', icon: Building2Icon, permission: 'company:manage' },
      {
        label: 'Perfis de acesso',
        to: '/acesso/perfis',
        icon: ShieldCheckIcon,
        permission: 'roles:read',
      },
      { label: 'Usuários', to: '/acesso/usuarios', icon: UsersIcon, permission: 'users:read' },
      { label: 'Auditoria', to: '/auditoria', icon: ScrollTextIcon, permission: 'audit:read' },
    ],
  },
];

const OVERVIEW: NavItem = { label: 'Visão geral', to: MANAGEMENT_HOME, icon: LayoutDashboardIcon };

/** Seções da gestão com os itens que o perfil permite (vazia: o usuário não tem gestão). */
export function visibleManagementNav(permissions: readonly Permission[]): NavSection[] {
  const sections = MANAGEMENT_NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permission || permissions.includes(item.permission),
    ),
  })).filter((section) => section.items.length > 0);
  return sections.length > 0 ? [{ items: [OVERVIEW] }, ...sections] : [];
}

export function hasManagementArea(permissions: readonly Permission[]): boolean {
  return visibleManagementNav(permissions).length > 0;
}

/** Itens da área pessoal que valem para este usuário. */
export function visiblePersonalNav(access: MyAccess | undefined): NavItem[] {
  if (!access?.hasEmployeeRecord) return [];
  return PERSONAL_NAV.filter((item) => !item.when || item.when(access));
}
