import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { describeScope } from './labels';
import { rolesQueryKey } from './query-keys';

export function RolesPage() {
  const api = useApi();
  const canManage = useCan('roles:manage');
  const roles = useQuery({ queryKey: rolesQueryKey, queryFn: () => api.access.roles.list() });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Perfis de acesso</h1>
          <p className="text-muted-foreground">
            O que cada perfil pode fazer e quais dados enxerga.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link to="/acesso/perfis/novo">
              <PlusIcon />
              Novo perfil
            </Link>
          </Button>
        ) : null}
      </div>

      {roles.isError ? <Alert variant="destructive">{errorMessage(roles.error)}</Alert> : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Perfil</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead>Escopo</TableHead>
              <TableHead className="text-right">Usuários</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.isPending
              ? Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : roles.data?.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <Link
                        to={`/acesso/perfis/${role.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {role.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {role.isSystem ? <Badge variant="secondary">Padrão</Badge> : null}
                        {role.requiresMfa ? <Badge variant="outline">Exige MFA</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>{role.permissions.length}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {role.scopes.map(describeScope).join(', ')}
                    </TableCell>
                    <TableCell className="text-right">{role.userCount}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
