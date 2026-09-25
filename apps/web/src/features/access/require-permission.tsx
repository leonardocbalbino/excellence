import type { Permission } from '@excellence/shared';
import { ShieldAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { FullPageSpinner } from '@/components/ui/feedback';
import { useMyAccess } from './access';

/** Mostra o conteúdo só com a permissão; sem ela, a página de acesso negado. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { data, isPending } = useMyAccess();
  if (isPending) return <FullPageSpinner />;
  if (!data?.permissions.includes(permission)) return <ForbiddenPage />;
  return children;
}

export function ForbiddenPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <ShieldAlertIcon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Acesso negado</h1>
      <p className="text-muted-foreground">
        Seu perfil não tem permissão para esta página. Se precisar dela, fale com o administrador.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
