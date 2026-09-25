import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { useApi } from '@/lib/services';
import { myAccessQueryKey, useMyAccess } from '../access/access';
import { MfaEnrollment } from '../auth/mfa-enrollment';

export function AccountSecurityPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const access = useMyAccess();
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: () => api.auth.me() });
  const [enrolling, setEnrolling] = useState(false);
  const required = access.data?.mfaSetupRequired ?? false;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Segurança da conta</h1>
      {required ? (
        <Alert variant="warning">
          Seu perfil exige verificação em duas etapas. Ative-a para voltar a usar o sistema.
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Verificação em duas etapas (MFA)</CardTitle>
          <CardDescription>
            Além da senha, pede um código do aplicativo autenticador do seu celular.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {me.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : me.data?.mfaEnabled ? (
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2Icon className="size-4 text-success" aria-hidden="true" />
              Ativada
            </p>
          ) : enrolling || required ? (
            <MfaEnrollment
              onDone={() => {
                setEnrolling(false);
                void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
                void queryClient.invalidateQueries({ queryKey: myAccessQueryKey });
              }}
            />
          ) : (
            <Button onClick={() => setEnrolling(true)}>Ativar verificação em duas etapas</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
