import { Link } from 'react-router';
import { visibleNavItems } from '@/app/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/services';
import { useMyAccess } from '../access/access';

export function HomePage() {
  const session = useSession();
  const access = useMyAccess();
  const name = session.status === 'authenticated' ? session.user.name.split(' ')[0] : '';
  const shortcuts = visibleNavItems(access.data?.permissions ?? []).filter(
    (item) => item.to !== '/',
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Olá, {name}</h1>
        <p className="text-muted-foreground">O que você quer fazer hoje?</p>
      </div>
      {shortcuts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
            >
              <Card className="h-full transition-colors hover:bg-accent">
                <CardHeader>
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  <CardTitle className="text-base">{label}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tudo pronto</CardTitle>
            <CardDescription>
              As funções do seu perfil aparecem aqui conforme os módulos forem liberados.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
