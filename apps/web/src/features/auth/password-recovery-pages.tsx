import {
  ApiError,
  forgotPasswordInputSchema,
  PASSWORD_RESET_MINUTES,
  resetPasswordInputSchema,
} from '@excellence/shared';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeftIcon, MailCheckIcon, ShieldCheckIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BrandLogo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, useApi } from '@/lib/services';

/** Moldura das telas públicas de senha: faixa preta com a logo e o formulário ao lado. */
function RecoveryLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="flex items-center rounded-b-3xl bg-sidebar px-6 py-8 lg:rounded-none lg:px-16">
        <BrandLogo className="h-20 w-auto lg:h-40" />
      </aside>
      <main className="flex items-start justify-center px-6 py-8 lg:items-center lg:py-12">
        <div className="w-full max-w-md">
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-4">
            <Link to="/login">
              <ArrowLeftIcon />
              Voltar para o login
            </Link>
          </Button>
          <h1 className="text-3xl font-bold lg:text-4xl">{title}</h1>
          <p className="mt-2 text-muted-foreground">{intro}</p>
          <div className="mt-8">{children}</div>
          <ThemeToggle className="mt-8 max-w-64" />
        </div>
      </main>
    </div>
  );
}

/** "Esqueci minha senha": pede o link por e-mail. A resposta não revela se o e-mail existe. */
export function ForgotPasswordPage() {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (value: string) => api.auth.forgotPassword({ email: value }),
  });

  if (send.isSuccess) {
    return (
      <RecoveryLayout title="Confira o seu e-mail" intro="O pedido foi recebido.">
        <Alert>
          <MailCheckIcon className="size-4" aria-hidden="true" />
          Se <strong>{email}</strong> tiver uma conta, chega em instantes um e-mail com o link para
          criar uma senha nova. O link vale por {PASSWORD_RESET_MINUTES} minutos. Não chegou? Olhe a
          caixa de spam ou peça de novo.
        </Alert>
        <Button className="mt-4" variant="outline" onClick={() => send.reset()}>
          Pedir de novo
        </Button>
      </RecoveryLayout>
    );
  }

  return (
    <RecoveryLayout
      title="Esqueci minha senha"
      intro="Informe o e-mail que você usa para entrar. Enviamos um link para criar uma senha nova."
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = forgotPasswordInputSchema.safeParse({ email });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'E-mail inválido');
            return;
          }
          setError(null);
          send.mutate(parsed.data.email);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="forgot-email">E-mail</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="username"
            placeholder="nome@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        {send.isError ? <Alert variant="destructive">{errorMessage(send.error)}</Alert> : null}
        <Button type="submit" size="lg" disabled={send.isPending}>
          {send.isPending ? <Spinner /> : null}
          Enviar link
        </Button>
      </form>
    </RecoveryLayout>
  );
}

/** Página do link do e-mail: cria a senha nova (encerra as sessões abertas da conta). */
export function ResetPasswordPage() {
  const api = useApi();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reset = useMutation({
    mutationFn: (newPassword: string) => api.auth.resetPassword({ token, newPassword }),
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
    },
  });

  if (reset.isSuccess) {
    return (
      <RecoveryLayout title="Senha criada" intro="Pronto: a sua senha nova já vale.">
        <Alert>
          <ShieldCheckIcon className="size-4" aria-hidden="true" />
          Por segurança, as sessões abertas em outros aparelhos foram encerradas.
        </Alert>
        <Button asChild size="lg" className="mt-4 w-full">
          <Link to="/login">Entrar com a senha nova</Link>
        </Button>
      </RecoveryLayout>
    );
  }

  if (!token) {
    return (
      <RecoveryLayout title="Link incompleto" intro="Abra o link exatamente como veio no e-mail.">
        <Button asChild variant="outline">
          <Link to="/esqueci-senha">Pedir um link novo</Link>
        </Button>
      </RecoveryLayout>
    );
  }

  return (
    <RecoveryLayout title="Criar senha nova" intro="Escolha uma senha que só você saiba.">
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = resetPasswordInputSchema.safeParse({ token, newPassword: password });
          if (!parsed.success) {
            setErrors(
              Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
            );
            return;
          }
          if (password !== confirm) {
            setErrors({ confirm: 'As senhas não são iguais' });
            return;
          }
          setErrors({});
          reset.mutate(password);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="reset-password">Senha nova</Label>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.newPassword ? (
            <p className="text-sm text-destructive">{errors.newPassword}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="reset-confirm">Repita a senha nova</Label>
          <Input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {errors.confirm ? <p className="text-sm text-destructive">{errors.confirm}</p> : null}
        </div>
        {reset.isError ? (
          <Alert variant="destructive">
            {errorMessage(reset.error)}{' '}
            {errors.token ? (
              <Link to="/esqueci-senha" className="font-semibold underline">
                Pedir um link novo
              </Link>
            ) : null}
          </Alert>
        ) : null}
        <Button type="submit" size="lg" disabled={reset.isPending}>
          {reset.isPending ? <Spinner /> : null}
          Salvar senha nova
        </Button>
      </form>
    </RecoveryLayout>
  );
}
