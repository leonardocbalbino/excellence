import type { MyAccess } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRightIcon,
  BellIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  KeyRoundIcon,
  LogOutIcon,
  MenuIcon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { Link, NavLink, Outlet, useMatches, useNavigate } from 'react-router';
import {
  MANAGEMENT_HOME,
  type NavItem,
  visiblePersonalNav,
  visibleManagementNav,
} from '@/app/navigation';
import { THEME_OPTIONS } from '@/components/theme-options';
import { Button } from '@/components/ui/button';
import { useMyAccess } from '@/features/access/access';
import { myFeedQueryKey } from '@/features/announcements/labels';
import { MFA_SETUP_PATH } from '@/features/auth/require-auth';
import { useApi, useServices, useSession } from '@/lib/services';
import { type ThemePreference, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Área da rota: a pessoal (o próprio ponto, escala, atestados) ou a de gestão (dados dos
 * outros funcionários). Rotas sem área (conta, página não encontrada) usam a área pessoal
 * de quem tem cadastro de funcionário e a de gestão de quem só administra.
 */
export type Area = 'personal' | 'management';
export interface RouteHandle {
  area?: Area;
}

function useArea(access: MyAccess | undefined): Area {
  const matches = useMatches();
  const routeArea = matches
    .map((match) => (match.handle as RouteHandle | undefined)?.area)
    .findLast(Boolean);
  const hasManagement = visibleManagementNav(access?.permissions ?? []).length > 0;
  const hasPersonal = access?.hasEmployeeRecord ?? false;
  const preferred = routeArea ?? (hasPersonal ? 'personal' : 'management');
  // Sem a área pedida, usa a outra (a própria página explica o que falta).
  if (preferred === 'personal' && !hasPersonal && hasManagement) return 'management';
  if (preferred === 'management' && !hasManagement && hasPersonal) return 'personal';
  return preferred;
}

export function AppShell() {
  const access = useMyAccess();
  const area = useArea(access.data);
  return area === 'personal' ? (
    <PersonalShell access={access.data} />
  ) : (
    <ManagementShell access={access.data} />
  );
}

function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:p-2"
    >
      Pular para o conteúdo
    </a>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground',
        className,
      )}
      aria-hidden="true"
    >
      <ClockIcon className="size-5" />
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/** Senha temporária ou MFA pendente: a API recusa o resto até resolver. */
function accessPending(access: MyAccess | undefined): boolean {
  return access ? access.passwordChangeRequired || access.mfaSetupRequired : false;
}

function useSignOut() {
  const { session } = useServices();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await session.signOut().catch(() => undefined);
    queryClient.clear();
    void navigate('/login', { replace: true });
  };
}

// ─── Área pessoal ─────────────────────────────────────────────────────────────────

function PersonalShell({ access }: { access: MyAccess | undefined }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasManagement = visibleManagementNav(access?.permissions ?? []).length > 0;
  const personal = access?.hasEmployeeRecord ?? false;
  const items = visiblePersonalNav(access);

  return (
    <div className="min-h-svh">
      <SkipLink />
      <header className="sticky top-0 z-30 border-b bg-card print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-8">
          <Link to="/" className="flex items-center gap-3 font-display text-lg font-bold">
            <BrandMark />
            Excellence
          </Link>
          <nav aria-label="Menu principal" className="hidden h-full items-stretch gap-1 lg:flex">
            {items.map((item) => (
              <TopNavLink key={item.to} item={item} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {hasManagement ? (
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link to={MANAGEMENT_HOME}>
                  <ArrowLeftRightIcon />
                  Área de gestão
                </Link>
              </Button>
            ) : null}
            {personal && !accessPending(access) ? <AnnouncementsBell /> : null}
            <UserDropdown />
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="menu-pessoal"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <XIcon /> : <MenuIcon />}
            </Button>
          </div>
        </div>
        {menuOpen ? (
          <nav id="menu-pessoal" aria-label="Menu principal" className="border-t p-3 lg:hidden">
            <ul className="grid gap-1">
              {items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent',
                        isActive && 'bg-primary-soft text-primary',
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
              {hasManagement ? (
                <li>
                  <Link
                    to={MANAGEMENT_HOME}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent"
                  >
                    <ArrowLeftRightIcon className="size-4" aria-hidden="true" />
                    Área de gestão
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>
        ) : null}
      </header>
      <main id="conteudo" className="mx-auto max-w-7xl min-w-0 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}

function TopNavLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center border-b-2 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
          isActive ? 'border-primary font-semibold text-primary' : 'border-transparent',
        )
      }
    >
      {item.label}
    </NavLink>
  );
}

/** Sino com os comunicados que aguardam leitura ou ciência. */
function AnnouncementsBell() {
  const api = useApi();
  const feed = useQuery({
    queryKey: myFeedQueryKey,
    queryFn: () => api.announcements.feed(),
    staleTime: 60_000,
  });
  const pending = feed.data?.pending ?? 0;
  return (
    <Button asChild variant="outline" size="icon" className="relative">
      <Link
        to="/comunicados"
        aria-label={
          pending > 0 ? `Comunicados: ${String(pending)} aguardando leitura` : 'Comunicados'
        }
      >
        <BellIcon />
        {pending > 0 ? (
          <span
            className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-warning px-1 text-[0.6875rem] font-bold text-white"
            aria-hidden="true"
          >
            {pending}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

/** Botão com as iniciais que abre o menu da conta (cabeçalho da área pessoal). */
function UserDropdown() {
  const state = useSession();
  if (state.status !== 'authenticated') return null;
  return (
    <AccountMenu>
      <button
        type="button"
        aria-label={`Conta de ${state.user.name}`}
        className="grid size-10 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {initials(state.user.name)}
      </button>
    </AccountMenu>
  );
}

/**
 * Menu da conta, igual nas duas áreas: perfil, tema, segurança e sair. O gatilho muda
 * (iniciais no topo da área pessoal; cartão do usuário no rodapé do menu da gestão).
 */
function AccountMenu({
  children,
  side = 'bottom',
  align = 'end',
  onNavigate,
}: {
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  onNavigate?: () => void;
}) {
  const state = useSession();
  const signOut = useSignOut();
  const theme = useTheme();
  if (state.status !== 'authenticated') return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={align}
          sideOffset={8}
          className="z-50 min-w-60 rounded-lg border bg-card p-1.5 text-card-foreground shadow-lg"
        >
          <div className="px-2.5 py-2 text-sm">
            <p className="truncate font-semibold">{state.user.name}</p>
            <p className="truncate text-muted-foreground">{state.user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Label className="px-2.5 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground">
            Tema
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={theme.preference}
            onValueChange={(value) => theme.setPreference(value as ThemePreference)}
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className={menuItemClass}
                // Trocar o tema não fecha o menu: dá para comparar as opções.
                onSelect={(event) => event.preventDefault()}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
                <DropdownMenu.ItemIndicator className="ml-auto">
                  <CheckIcon className="size-4 text-primary" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild className={menuItemClass}>
            <Link to="/perfil" onClick={onNavigate}>
              <UserRoundIcon className="size-4" aria-hidden="true" />
              Meu perfil
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={menuItemClass}>
            <Link to={MFA_SETUP_PATH} onClick={onNavigate}>
              <KeyRoundIcon className="size-4" aria-hidden="true" />
              Segurança da conta
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemClass} onSelect={() => void signOut()}>
            <LogOutIcon className="size-4" aria-hidden="true" />
            Sair
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const menuItemClass =
  'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent';

// ─── Área de gestão ───────────────────────────────────────────────────────────────

function ManagementShell({ access }: { access: MyAccess | undefined }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const sections = visibleManagementNav(access?.permissions ?? []);
  const close = () => setMenuOpen(false);

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[16.5rem_1fr] print:block">
      <SkipLink />
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-sidebar px-4 text-sidebar-foreground lg:hidden print:hidden">
        <Link to={MANAGEMENT_HOME} className="flex items-center gap-2.5 font-display font-bold">
          <BrandMark className="size-8 bg-sidebar-accent" />
          Excellence
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-white/10 hover:text-white"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="menu-gestao"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <XIcon /> : <MenuIcon />}
        </Button>
      </header>

      <aside
        id="menu-gestao"
        className={cn(
          'bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col print:hidden!',
          menuOpen ? 'flex flex-col' : 'hidden',
        )}
      >
        <Link
          to={MANAGEMENT_HOME}
          className="hidden items-center gap-3 px-6 pt-6 pb-4 font-display text-lg font-bold lg:flex"
        >
          <BrandMark className="bg-sidebar-accent" />
          Excellence
        </Link>
        <nav aria-label="Menu principal" className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
          {sections.map((section) => (
            <div key={section.title ?? 'inicio'}>
              {section.title ? (
                <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-wider text-sidebar-muted uppercase">
                  {section.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end ?? to === MANAGEMENT_HOME}
                      onClick={close}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/5',
                          isActive &&
                            'bg-sidebar-accent font-semibold text-white hover:bg-sidebar-accent',
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <SidebarFooter access={access} onNavigate={close} />
      </aside>

      <main id="conteudo" className="min-w-0 px-4 py-6 md:px-8 md:py-8 print:p-0">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarFooter({
  access,
  onNavigate,
}: {
  access: MyAccess | undefined;
  onNavigate: () => void;
}) {
  const state = useSession();
  if (state.status !== 'authenticated') return null;
  const linkClass =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-white/5';

  return (
    <div className="space-y-1 border-t border-sidebar-border p-3">
      {access?.hasEmployeeRecord ? (
        // Segregação: o próprio ponto fica na área pessoal, não na de gestão.
        <Link
          to="/"
          onClick={onNavigate}
          className="mb-2 flex items-center gap-3 rounded-lg border border-sidebar-border px-3 py-2.5 text-sm font-semibold hover:bg-white/5"
        >
          <ArrowLeftRightIcon className="size-4" aria-hidden="true" />
          Meu espaço
        </Link>
      ) : // Sem área pessoal, os comunicados recebidos ficam aqui (ADR 0014).
      accessPending(access) ? null : (
        <ReceivedAnnouncementsLink className={linkClass} onNavigate={onNavigate} />
      )}
      <AccountMenu side="top" align="start" onNavigate={onNavigate}>
        <button
          type="button"
          aria-label={`Conta de ${state.user.name}`}
          className="mt-2 flex w-full items-center gap-3 rounded-lg bg-white/5 p-2.5 text-left transition-colors outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary"
            aria-hidden="true"
          >
            {initials(state.user.name)}
          </span>
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold text-white">{state.user.name}</p>
            <p className="truncate text-xs text-sidebar-muted">{state.user.email}</p>
          </div>
          <ChevronsUpDownIcon
            className="ml-auto size-4 shrink-0 text-sidebar-muted"
            aria-hidden="true"
          />
        </button>
      </AccountMenu>
    </div>
  );
}

function ReceivedAnnouncementsLink({
  className,
  onNavigate,
}: {
  className: string;
  onNavigate: () => void;
}) {
  const api = useApi();
  const feed = useQuery({
    queryKey: myFeedQueryKey,
    queryFn: () => api.announcements.feed(),
    staleTime: 60_000,
  });
  const pending = feed.data?.pending ?? 0;
  return (
    <Link to="/comunicados" onClick={onNavigate} className={className}>
      <BellIcon className="size-4" aria-hidden="true" />
      Comunicados recebidos
      {pending > 0 ? (
        <span className="ml-auto rounded-full bg-warning px-2 text-xs font-bold text-white">
          {pending}
          <span className="sr-only"> aguardando leitura</span>
        </span>
      ) : null}
    </Link>
  );
}
