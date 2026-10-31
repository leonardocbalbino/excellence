import { type AccountInput, accountInputSchema, ApiError, type AuthUser } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, useApi, useServices } from '@/lib/services';
import { uploadFile } from '@/lib/upload';

const avatarQueryKey = ['me', 'avatar'] as const;
const meQueryKey = ['auth', 'me'] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/** Foto de perfil (ou as iniciais), com trocar e remover. A mesma do app do funcionário. */
export function ProfileAvatar({ name }: { name: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const avatar = useQuery({
    queryKey: avatarQueryKey,
    queryFn: () => api.profile.avatar(),
    // O link é temporário: renova antes de vencer.
    staleTime: 4 * 60_000,
  });
  const change = useMutation({
    mutationFn: async (file: File | null) => {
      if (file) {
        const fileId = await uploadFile(api, file, 'avatar');
        await api.profile.setAvatar({ fileId });
      } else {
        await api.profile.removeAvatar();
      }
    },
    onSuccess: async (_, file) => {
      toast.success(file ? 'Foto atualizada.' : 'Foto removida.');
      await queryClient.invalidateQueries({ queryKey: avatarQueryKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="flex items-center gap-3">
      <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-display text-2xl font-bold text-primary">
        {avatar.data ? (
          <img src={avatar.data.url} alt="Sua foto de perfil" className="size-full object-cover" />
        ) : (
          <span aria-hidden="true">{initials(name)}</span>
        )}
        {change.isPending ? (
          <span className="absolute inset-0 grid place-items-center bg-black/40">
            <Spinner />
          </span>
        ) : null}
      </span>
      <div className="flex flex-col gap-1.5">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Escolher foto de perfil"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) change.mutate(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={change.isPending}
          onClick={() => input.current?.click()}
        >
          <CameraIcon />
          {avatar.data ? 'Trocar foto' : 'Adicionar foto'}
        </Button>
        {avatar.data ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={change.isPending}
            onClick={() => change.mutate(null)}
          >
            <Trash2Icon />
            Remover
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Nome e e-mail de login. Trocar o e-mail pede a senha atual. */
export function AccountForm({ user, onDone }: { user: AuthUser; onDone: () => void }) {
  const { api, session } = useServices();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<AccountInput>({
    name: user.name,
    email: user.email,
    currentPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const emailChanged = values.email.trim().toLowerCase() !== user.email.toLowerCase();

  const save = useMutation({
    mutationFn: (input: AccountInput) => api.auth.updateAccount(input),
    onSuccess: async (updated) => {
      session.updateUser(updated);
      queryClient.setQueryData(meQueryKey, updated);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Conta atualizada.');
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
    },
  });

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const input = {
      name: values.name,
      email: values.email,
      ...(emailChanged ? { currentPassword: values.currentPassword } : {}),
    };
    const parsed = accountInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    if (emailChanged && !values.currentPassword) {
      setErrors({ currentPassword: 'Confirme a sua senha para trocar o e-mail' });
      return;
    }
    setErrors({});
    save.mutate(input);
  };
  const error = (name: string) =>
    errors[name] ? <p className="text-sm text-destructive">{errors[name]}</p> : null;

  return (
    <form className="mt-4 grid gap-4" noValidate onSubmit={submit}>
      <div className="grid gap-2">
        <Label htmlFor="account-name">Nome</Label>
        <Input
          id="account-name"
          autoComplete="name"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
        {error('name')}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="account-email">E-mail de login</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
        {error('email')}
      </div>
      {emailChanged ? (
        <div className="grid gap-2">
          <Label htmlFor="account-password">Senha atual</Label>
          <Input
            id="account-password"
            type="password"
            autoComplete="current-password"
            value={values.currentPassword ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, currentPassword: e.target.value }))}
          />
          <p className="text-sm text-muted-foreground">
            O e-mail é o seu login e é para ele que vai o link de “Esqueci minha senha”.
          </p>
          {error('currentPassword')}
        </div>
      ) : null}
      {save.isError && !(save.error instanceof ApiError && Object.keys(errors).length > 0) ? (
        <Alert variant="destructive">{errorMessage(save.error)}</Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function EditAccountButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <PencilIcon />
      Editar nome e e-mail
    </Button>
  );
}
