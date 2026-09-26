import type { Announcement } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, useApi } from '@/lib/services';
import { ANNOUNCEMENT_STATUS, announcementsQueryKey, audienceLabel, formatInstant } from './labels';

type StatusFilter = Announcement['status'] | 'all';

export function AnnouncementsPage() {
  const api = useApi();
  const [status, setStatus] = useState<StatusFilter>('all');
  const list = useQuery({
    queryKey: [...announcementsQueryKey, 'manage', status],
    queryFn: () => api.announcements.list(status === 'all' ? undefined : status),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Gestão de comunicados</h1>
          <p className="text-muted-foreground">
            Publicado, o comunicado não muda mais: a ciência vale para o texto lido.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid gap-2">
            <Label htmlFor="announcement-status">Situação</Label>
            <Select
              id="announcement-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="all">Todos</option>
              <option value="draft">Rascunhos</option>
              <option value="published">Publicados</option>
              <option value="archived">Arquivados</option>
            </Select>
          </div>
          <Button asChild>
            <Link to="/gestao/comunicados/novo">
              <PlusIcon />
              Novo comunicado
            </Link>
          </Button>
        </div>
      </div>
      {list.isError ? <Alert variant="destructive">{errorMessage(list.error)}</Alert> : null}
      {list.isPending ? (
        <Skeleton className="h-60 w-full" />
      ) : list.data?.length === 0 ? (
        <Alert>Nenhum comunicado.</Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Público</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Leituras</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link
                    to={`/gestao/comunicados/${item.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {item.title}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {item.publishedAt
                      ? `Publicado em ${formatInstant(item.publishedAt)}`
                      : `Criado em ${formatInstant(item.createdAt)}`}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {audienceLabel(item.audience)}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === 'published' ? 'default' : 'secondary'}>
                    {ANNOUNCEMENT_STATUS[item.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.status === 'draft'
                    ? '—'
                    : item.requiresAcknowledgment
                      ? `${String(item.stats.viewed)} · ${String(item.stats.acknowledged)} ciente(s)`
                      : String(item.stats.viewed)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
