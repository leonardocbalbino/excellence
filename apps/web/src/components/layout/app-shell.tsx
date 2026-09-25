import { useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, LogOutIcon, MenuIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { visibleNavItems } from '@/app/navigation';
import { Button } from '@/components/ui/button';
import { useMyAccess } from '@/features/access/access';
import { MFA_SETUP_PATH } from '@/features/auth/require-auth';
import { useServices, useSession } from '@/lib/services';
import { cn } from '@/lib/utils';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const access = useMyAccess();
  const items = visibleNavItems(access.data?.permissions ?? []);

  return (
    <div className="min-h-svh md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:p-2"
      >
        Pular para o conteúdo
      </a>
      <header className="flex h-14 items-center justify-between border-b px-4 md:hidden">
        <Link to="/" className="font-semibold text-primary">
          Excellence
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="menu-principal"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <XIcon /> : <MenuIcon />}
        </Button>
      </header>

      <aside
        id="menu-principal"
        className={cn(
          'border-r bg-muted/30 md:flex md:min-h-svh md:flex-col',
          menuOpen ? 'flex flex-col' : 'hidden',
        )}
      >
        <Link to="/" className="hidden h-14 items-center px-6 font-semibold text-primary md:flex">
          Excellence
        </Link>
        <nav aria-label="Menu principal" className="flex-1 space-y-1 p-3">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <UserMenu onNavigate={() => setMenuOpen(false)} />
      </aside>

      <main id="conteudo" className="min-w-0 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

function UserMenu({ onNavigate }: { onNavigate: () => void }) {
  const { session } = useServices();
  const state = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (state.status !== 'authenticated') return null;

  const signOut = async () => {
    await session.signOut().catch(() => undefined);
    queryClient.clear();
    void navigate('/login', { replace: true });
  };

  return (
    <div className="space-y-2 border-t p-3">
      <div className="px-3 text-sm">
        <p className="truncate font-medium">{state.user.name}</p>
        <p className="truncate text-muted-foreground">{state.user.email}</p>
      </div>
      <Button asChild variant="ghost" className="w-full justify-start" onClick={onNavigate}>
        <Link to={MFA_SETUP_PATH}>
          <KeyRoundIcon />
          Segurança da conta
        </Link>
      </Button>
      <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut()}>
        <LogOutIcon />
        Sair
      </Button>
    </div>
  );
}
