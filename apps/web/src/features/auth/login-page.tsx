import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiError,
  type AuthenticatedResponse,
  loginRequestSchema,
  mfaCodeRequestSchema,
  type MfaPendingResponse,
  ProblemType,
} from '@excellence/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { errorMessage, useServices, useSession } from '@/lib/services';
import { MfaEnrollment } from './mfa-enrollment';
import { safeNext } from './safe-next';

type Step = { kind: 'credentials' } | { kind: 'mfa'; pending: MfaPendingResponse };

export function LoginPage() {
  const { session } = useServices();
  const state = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [step, setStep] = useState<Step>({ kind: 'credentials' });

  if (state.status === 'authenticated') return <Navigate to={next} replace />;

  const complete = (response: AuthenticatedResponse) => {
    queryClient.clear();
    session.signIn(response);
    void navigate(next, { replace: true });
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <span className="text-primary">Excellence</span>
          </CardTitle>
          <CardDescription>
            {step.kind === 'credentials'
              ? 'Entre com seu e-mail e senha.'
              : step.pending.status === 'mfa_required'
                ? 'Informe o código do aplicativo autenticador.'
                : 'Seu perfil exige verificação em duas etapas. Configure agora para continuar.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step.kind === 'credentials' ? (
            <CredentialsForm
              onAuthenticated={complete}
              onMfa={(pending) => setStep({ kind: 'mfa', pending })}
            />
          ) : step.pending.status === 'mfa_required' ? (
            <MfaChallengeForm
              mfaToken={step.pending.mfaToken}
              onAuthenticated={complete}
              onRestart={() => setStep({ kind: 'credentials' })}
            />
          ) : (
            <MfaEnrollment
              enrollmentToken={step.pending.mfaToken}
              onDone={(result) => {
                if (result.session) complete(result.session);
              }}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

type CredentialsValues = z.input<typeof loginRequestSchema>;

function CredentialsForm({
  onAuthenticated,
  onMfa,
}: {
  onAuthenticated: (response: AuthenticatedResponse) => void;
  onMfa: (pending: MfaPendingResponse) => void;
}) {
  const { api } = useServices();
  const form = useForm<CredentialsValues>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (values: CredentialsValues) => api.auth.login({ ...values, client: 'web' }),
    onSuccess: (response) => {
      if (response.status === 'authenticated') onAuthenticated(response);
      else onMfa(response);
    },
  });

  const { errors } = form.formState;
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => void form.handleSubmit((values) => login.mutate(values))(event)}
      noValidate
    >
      <FormField label="E-mail" error={errors.email?.message}>
        {(field) => (
          <Input {...field} {...form.register('email')} type="email" autoComplete="username" />
        )}
      </FormField>
      <FormField label="Senha" error={errors.password?.message}>
        {(field) => (
          <Input
            {...field}
            {...form.register('password')}
            type="password"
            autoComplete="current-password"
          />
        )}
      </FormField>
      {login.isError ? (
        <Alert variant="destructive">
          {login.error instanceof ApiError && login.error.type === ProblemType.TooManyAttempts
            ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
            : errorMessage(login.error)}
        </Alert>
      ) : null}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? <Spinner /> : null}
        Entrar
      </Button>
    </form>
  );
}

type CodeValues = z.input<typeof mfaCodeRequestSchema>;

function MfaChallengeForm({
  mfaToken,
  onAuthenticated,
  onRestart,
}: {
  mfaToken: string;
  onAuthenticated: (response: AuthenticatedResponse) => void;
  onRestart: () => void;
}) {
  const { api } = useServices();
  const form = useForm<CodeValues>({
    resolver: zodResolver(mfaCodeRequestSchema),
    defaultValues: { code: '' },
  });
  const verify = useMutation({
    mutationFn: (values: CodeValues) => api.auth.verifyMfa(mfaToken, values),
    onSuccess: onAuthenticated,
  });
  // Token de desafio expirado (5 min): só recomeçando o login.
  const expired =
    verify.error instanceof ApiError && verify.error.type === ProblemType.Unauthenticated;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => void form.handleSubmit((values) => verify.mutate(values))(event)}
      noValidate
    >
      <FormField
        label="Código"
        error={form.formState.errors.code?.message}
        hint="6 dígitos do aplicativo ou um código de recuperação (XXXXX-XXXXX)."
      >
        {(field) => (
          <Input
            {...field}
            {...form.register('code')}
            autoComplete="one-time-code"
            autoFocus
            maxLength={11}
          />
        )}
      </FormField>
      {verify.isError ? (
        <Alert variant="destructive">
          {expired ? 'O tempo para informar o código acabou.' : errorMessage(verify.error)}
        </Alert>
      ) : null}
      <Button type="submit" disabled={verify.isPending || expired}>
        {verify.isPending ? <Spinner /> : null}
        Verificar
      </Button>
      <Button type="button" variant="ghost" onClick={onRestart}>
        Voltar ao login
      </Button>
    </form>
  );
}
