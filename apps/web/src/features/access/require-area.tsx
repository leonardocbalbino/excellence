import { UserRoundXIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { hasManagementArea, MANAGEMENT_HOME } from '@/app/navigation';
import { Button } from '@/components/ui/button';
import { FullPageSpinner } from '@/components/ui/feedback';
import { useMyAccess } from './access';
import { ForbiddenPage } from './require-permission';

/**
 * Área pessoal (ponto, escala, atestados): só para quem tem cadastro de funcionário. Quem só
 * administra o sistema não bate ponto; a API também recusa (`no-employee-record`).
 */
export function RequireEmployeeRecord({ children }: { children: ReactNode }) {
  const { data, isPending } = useMyAccess();
  if (isPending) return <FullPageSpinner />;
  if (data?.hasEmployeeRecord) return children;
  const management = hasManagementArea(data?.permissions ?? []);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <UserRoundXIcon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Sem cadastro de funcionário</h1>
      <p className="text-muted-foreground">
        Seu usuário não está ligado a um cadastro de funcionário, então não tem ponto, escala nem
        atestados próprios.
        {management ? ' Os dados da equipe ficam na área de gestão.' : ''}
      </p>
      {management ? (
        <Button asChild>
          <Link to={MANAGEMENT_HOME}>Ir para a visão geral</Link>
        </Button>
      ) : null}
    </div>
  );
}

/** Páginas de gestão sem permissão própria (a visão geral): exige alguma função de gestão. */
export function RequireManagementArea({ children }: { children: ReactNode }) {
  const { data, isPending } = useMyAccess();
  if (isPending) return <FullPageSpinner />;
  if (!hasManagementArea(data?.permissions ?? [])) return <ForbiddenPage />;
  return children;
}
