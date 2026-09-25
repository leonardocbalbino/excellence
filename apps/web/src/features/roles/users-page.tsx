import type { Role, UserWithRoles } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, useApi } from '@/lib/services';
import { myAccessQueryKey, useCan } from '../access/access';
import { rolesQueryKey, usersQueryKey } from './query-keys';

export function UsersPage() {
  const api = useApi();
  const canManage = useCan('users:manage');
  const users = useQuery({ queryKey: usersQueryKey, queryFn: () => api.access.users.list() });
  const roles = useQuery({
    queryKey: rolesQueryKey,
    queryFn: () => api.access.roles.list(),
    enabled: canManage,
  });
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-muted-foreground">Quem acessa o sistema e com quais perfis.</p>
      </div>
      {users.isError ? <Alert variant="destructive">{errorMessage(users.error)}</Alert> : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Perfis</TableHead>
              <TableHead>Situação</TableHead>
              {canManage ? <TableHead className="sr-only">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isPending ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : (
              users.data?.map((user) =>
                editing === user.id && roles.data ? (
                  <TableRow key={user.id}>
                    <TableCell colSpan={4}>
                      <AssignRolesForm
                        user={user}
                        roles={roles.data}
                        onClose={() => setEditing(null)}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length === 0 ? (
                          <span className="text-sm text-muted-foreground">Nenhum</span>
                        ) : (
                          user.roles.map((role) => (
                            <Badge key={role.id} variant="secondary">
                              {role.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {user.isActive ? 'Ativo' : 'Inativo'}
                      {user.mfaEnabled ? ' · MFA ativo' : ''}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(user.id)}
                          aria-label={`Editar perfis de ${user.name}`}
                        >
                          Editar perfis
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ),
              )
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function AssignRolesForm({
  user,
  roles,
  onClose,
}: {
  user: UserWithRoles;
  roles: readonly Role[];
  onClose: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(() => new Set(user.roles.map((role) => role.id)));
  const save = useMutation({
    mutationFn: () => api.access.users.assignRoles(user.id, { roleIds: [...selected] }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey });
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey });
      await queryClient.invalidateQueries({ queryKey: myAccessQueryKey });
      toast.success(`Perfis de ${user.name} atualizados.`);
      onClose();
    },
  });

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="font-medium">Perfis de {user.name}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => (
          <div key={role.id} className="flex items-center gap-2">
            <Checkbox
              id={`role-${user.id}-${role.id}`}
              checked={selected.has(role.id)}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (checked === true) next.add(role.id);
                else next.delete(role.id);
                setSelected(next);
              }}
            />
            <Label htmlFor={`role-${user.id}-${role.id}`}>{role.name}</Label>
          </div>
        ))}
      </div>
      {save.isError ? <Alert variant="destructive">{errorMessage(save.error)}</Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          Salvar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
