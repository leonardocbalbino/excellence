import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '@/components/ui/feedback';
import { useSession } from '@/lib/services';
import { useMyAccess } from '../access/access';

export const MFA_SETUP_PATH = '/conta/seguranca';

/**
 * Protege as rotas internas: sem sessão, vai para o login (voltando depois para onde
 * estava). Se o perfil passou a exigir MFA e o usuário ainda não ativou, só a página de
 * segurança da conta fica acessível (a API também bloqueia as demais).
 */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  const access = useMyAccess();

  if (session.status === 'loading') return <FullPageSpinner />;
  if (session.status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (access.data?.mfaSetupRequired && location.pathname !== MFA_SETUP_PATH) {
    return <Navigate to={MFA_SETUP_PATH} replace />;
  }
  return <Outlet />;
}
