import { Navigate } from 'react-router';
import { hasManagementArea, MANAGEMENT_HOME } from '@/app/navigation';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FullPageSpinner } from '@/components/ui/feedback';
import { useMyAccess } from '../access/access';
import { MyHomePage } from './my-home-page';

/**
 * Início: quem tem cadastro de funcionário cai na área pessoal (o próprio ponto); quem só
 * administra vai direto para a visão geral da gestão.
 */
export function HomeEntry() {
  const { data, isPending } = useMyAccess();
  if (isPending) return <FullPageSpinner />;
  if (data?.hasEmployeeRecord) return <MyHomePage />;
  if (hasManagementArea(data?.permissions ?? [])) {
    return <Navigate to={MANAGEMENT_HOME} replace />;
  }
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="text-base">Tudo pronto</CardTitle>
        <CardDescription>
          Seu usuário ainda não tem cadastro de funcionário nem funções de gestão. Fale com o RH
          para liberar o acesso.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
