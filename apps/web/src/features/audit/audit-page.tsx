import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, useApi } from '@/lib/services';
import { ACTION_LABELS } from './action-labels';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

export function AuditPage() {
  const api = useApi();
  const [action, setAction] = useState('');
  const [filter, setFilter] = useState('');
  const logs = useInfiniteQuery({
    queryKey: ['audit-logs', filter],
    queryFn: ({ pageParam }) =>
      api.audit.list({
        ...(filter ? { action: filter } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = logs.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Auditoria</h1>
        <p className="text-muted-foreground">
          Registro permanente das ações no sistema. Esta consulta também fica registrada.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter(action.trim());
        }}
      >
        <div className="w-64">
          <FormField label="Ação" hint="Ex.: auth.login_failed">
            {(field) => (
              <Input {...field} value={action} onChange={(e) => setAction(e.target.value)} />
            )}
          </FormField>
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      {logs.isError ? <Alert variant="destructive">{errorMessage(logs.error)}</Alert> : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data e hora</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Recurso</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isPending ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            ) : (
              items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap">
                    {dateTime.format(new Date(log.occurredAt))}
                  </TableCell>
                  <TableCell>{ACTION_LABELS[log.action] ?? log.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.resourceType ? `${log.resourceType} ${log.resourceId ?? ''}` : '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.actorUserId ? log.actorUserId.slice(0, 8) : 'sistema'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.actorIp ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      {logs.hasNextPage ? (
        <Button
          variant="outline"
          onClick={() => void logs.fetchNextPage()}
          disabled={logs.isFetchingNextPage}
        >
          {logs.isFetchingNextPage ? <Spinner /> : null}
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
