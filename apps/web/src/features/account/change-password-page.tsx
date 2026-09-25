import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordInputSchema } from '@excellence/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { applyFieldErrors } from '@/lib/form-errors';
import { errorMessage, useApi } from '@/lib/services';
import { myAccessQueryKey, useMyAccess } from '../access/access';

const formSchema = changePasswordInputSchema
  .extend({ confirmation: z.string() })
  .refine((values) => values.newPassword === values.confirmation, {
    path: ['confirmation'],
    message: 'As senhas não conferem',
  });
type FormValues = z.input<typeof formSchema>;

export function ChangePasswordPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const required = useMyAccess().data?.passwordChangeRequired ?? false;
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmation: '' },
  });
  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: FormValues) =>
      api.auth.changePassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: myAccessQueryKey });
      toast.success('Senha alterada. As outras sessões foram encerradas.');
      void navigate('/', { replace: true });
    },
    onError: (error) => applyFieldErrors(error, form.setError),
  });
  const { errors } = form.formState;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Trocar senha</CardTitle>
          <CardDescription>
            {required
              ? 'Você entrou com uma senha temporária. Crie sua senha para continuar.'
              : 'Ao trocar a senha, as outras sessões abertas são encerradas.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(event) => void form.handleSubmit((values) => change.mutate(values))(event)}
          >
            <FormField
              label={required ? 'Senha temporária' : 'Senha atual'}
              error={errors.currentPassword?.message}
            >
              {(field) => (
                <Input
                  {...field}
                  {...form.register('currentPassword')}
                  type="password"
                  autoComplete="current-password"
                />
              )}
            </FormField>
            <FormField label="Nova senha" error={errors.newPassword?.message}>
              {(field) => (
                <Input
                  {...field}
                  {...form.register('newPassword')}
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </FormField>
            <FormField label="Repita a nova senha" error={errors.confirmation?.message}>
              {(field) => (
                <Input
                  {...field}
                  {...form.register('confirmation')}
                  type="password"
                  autoComplete="new-password"
                />
              )}
            </FormField>
            {change.isError && !errors.currentPassword && !errors.newPassword ? (
              <Alert variant="destructive">{errorMessage(change.error)}</Alert>
            ) : null}
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? <Spinner /> : null}
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
