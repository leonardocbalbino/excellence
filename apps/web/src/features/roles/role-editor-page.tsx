import type { RoleInput } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, Trash2Icon } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { errorMessage, useApi } from '@/lib/services';
import { myAccessQueryKey, useCan } from '../access/access';
import { RoleForm } from './role-form';
import { rolesQueryKey } from './query-keys';

export function RoleEditorPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan('roles:manage');

  const catalog = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.access.permissions(),
    staleTime: Infinity,
  });
  const role = useQuery({
    queryKey: [...rolesQueryKey, id],
    queryFn: () => api.access.roles.get(id ?? ''),
    enabled: !isNew,
  });

  const afterChange = async () => {
    await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
    // Mudar um perfil pode mudar as permissões do próprio usuário.
    await queryClient.invalidateQueries({ queryKey: myAccessQueryKey });
  };

  const save = async (values: RoleInput) => {
    if (isNew) {
      const created = await api.access.roles.create(values);
      await afterChange();
      toast.success('Perfil criado.');
      void navigate(`/acesso/perfis/${created.id}`, { replace: true });
    } else {
      await api.access.roles.update(id, values);
      await afterChange();
      toast.success('Perfil salvo.');
    }
  };

  const remove = useMutation({
    mutationFn: () => api.access.roles.remove(id ?? ''),
    onSuccess: async () => {
      await afterChange();
      toast.success('Perfil excluído.');
      void navigate('/acesso/perfis', { replace: true });
    },
  });

  const loading = catalog.isPending || (!isNew && role.isPending);
  const loadError = catalog.error ?? role.error;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/acesso/perfis">
          <ArrowLeftIcon />
          Perfis de acesso
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {isNew ? 'Novo perfil' : (role.data?.name ?? 'Perfil')}
        </h1>
        {!isNew && canManage && role.data && !role.data.isSystem ? (
          <Button
            variant="outline"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Excluir o perfil "${role.data.name}"?`)) remove.mutate();
            }}
          >
            <Trash2Icon />
            Excluir
          </Button>
        ) : null}
      </div>

      {remove.isError ? <Alert variant="destructive">{errorMessage(remove.error)}</Alert> : null}
      {loadError ? <Alert variant="destructive">{errorMessage(loadError)}</Alert> : null}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : catalog.data ? (
            <RoleForm
              key={role.data?.id ?? 'novo'}
              catalog={catalog.data}
              role={role.data}
              readOnly={!canManage}
              onSubmit={save}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
