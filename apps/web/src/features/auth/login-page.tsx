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
import { ClockIcon, ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative flex flex-col justify-between gap-6 rounded-b-3xl bg-primary px-6 pt-8 pb-8 text-primary-foreground lg:rounded-none lg:px-16 lg:py-12">
        <p className="flex items-center gap-3 font-display text-lg font-bold">
          <span
            className="grid size-10 place-items-center rounded-xl bg-card text-primary"
            aria-hidden="true"
          >
            <ClockIcon className="size-5" />
          </span>
          Excellence
        </p>
        <div className="max-w-md">
          <p className="font-display text-3xl leading-tight font-bold lg:text-5xl">
            <span className="lg:hidden">Seu ponto e o RH na palma da mão.</span>
            <span className="hidden lg:inline">Seu ponto, sua escala e o RH no mesmo lugar.</span>
          </p>
          <p className="mt-4 hidden text-lg text-white/85 lg:block">
            Registre a jornada, envie atestados e acompanhe os comunicados da empresa de qualquer
            dispositivo.
          </p>
        </div>
        <p className="hidden text-sm text-white/70 lg:block">
          Excellence · Pessoas, ponto e rondas
        </p>
      </aside>

      <main className="flex items-start justify-center px-6 py-8 lg:items-center lg:py-12">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-bold lg:text-4xl">
            {step.kind === 'credentials' ? 'Entrar' : 'Verificação em duas etapas'}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {step.kind === 'credentials'
              ? 'Use seu e-mail corporativo e sua senha.'
              : step.pending.status === 'mfa_required'
                ? 'Informe o código do aplicativo autenticador.'
                : 'Seu perfil exige verificação em duas etapas. Configure agora para continuar.'}
          </p>
          <div className="mt-8">
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
          </div>
          {step.kind === 'credentials' ? (
            <>
              <p className="mt-6 flex gap-3 rounded-lg bg-primary-soft p-4 text-sm text-accent-foreground">
                <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Perfis de administração e RH confirmam o acesso com um código de verificação.
              </p>
              <p className="mt-6 text-sm text-muted-foreground">
                Primeiro acesso? Use a senha temporária enviada pelo RH; o sistema pede a troca logo
                em seguida. Esqueceu a senha? Fale com o RH.
              </p>
            </>
          ) : null}
          <ThemeToggle className="mt-8 max-w-64" />
        </div>
      </main>
    </div>
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
          <Input
            {...field}
            {...form.register('email')}
            type="email"
            autoComplete="username"
            placeholder="nome@empresa.com.br"
          />
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
      <Button type="submit" size="lg" disabled={login.isPending}>
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
