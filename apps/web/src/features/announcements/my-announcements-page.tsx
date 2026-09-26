import type { MyAnnouncement } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheckIcon, ChevronLeftIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { errorMessage, useApi } from '@/lib/services';
import { announcementsQueryKey, formatInstant } from './labels';

const feedKey = [...announcementsQueryKey, 'me'] as const;

/** Mural de comunicados do usuário. Abrir registra a leitura; alguns pedem ciência. */
export function MyAnnouncementsPage() {
  const api = useApi();
  const [openId, setOpenId] = useState<string | null>(null);
  const feed = useQuery({ queryKey: feedKey, queryFn: () => api.announcements.feed() });

  if (openId) return <AnnouncementReader id={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Comunicados</h1>
        <p className="text-muted-foreground">
          {feed.data && feed.data.pending > 0
            ? `${String(feed.data.pending)} comunicado(s) aguardando sua leitura.`
            : 'Avisos da empresa para você.'}
        </p>
      </div>
      {feed.isError ? <Alert variant="destructive">{errorMessage(feed.error)}</Alert> : null}
      {feed.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : feed.data?.items.length === 0 ? (
        <Alert>Nenhum comunicado no momento.</Alert>
      ) : (
        <ul className="grid gap-2">
          {feed.data?.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left hover:bg-accent"
              >
                <span>
                  <span className={item.viewedAt ? '' : 'font-semibold'}>{item.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatInstant(item.publishedAt)}
                  </span>
                </span>
                <StatusBadge item={item} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ item }: { item: MyAnnouncement }) {
  if (!item.viewedAt) return <Badge>Novo</Badge>;
  if (item.requiresAcknowledgment && !item.acknowledgedAt) {
    return <Badge variant="secondary">Confirme a ciência</Badge>;
  }
  return null;
}

function AnnouncementReader({ id, onBack }: { id: string; onBack: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  // Abrir é um efeito (registra a leitura): mutation, não query, para não repetir em refetch.
  const open = useMutation({ mutationFn: () => api.announcements.open(id) });
  const acknowledge = useMutation({
    mutationFn: () => api.announcements.acknowledge(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedKey }),
  });
  const { mutate } = open;
  useEffect(() => {
    mutate(undefined, {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: feedKey }),
    });
  }, [mutate, queryClient]);

  const item = acknowledge.data ?? open.data;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ChevronLeftIcon />
        Comunicados
      </Button>
      {open.isError ? <Alert variant="destructive">{errorMessage(open.error)}</Alert> : null}
      {!item ? (
        open.isError ? null : (
          <Skeleton className="h-60 w-full" />
        )
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{item.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Publicado em {formatInstant(item.publishedAt)}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="whitespace-pre-wrap">{item.body}</p>
            {item.requiresAcknowledgment ? (
              item.acknowledgedAt ? (
                <Alert>Ciência registrada em {formatInstant(item.acknowledgedAt)}.</Alert>
              ) : (
                <div className="grid gap-2">
                  {acknowledge.isError ? (
                    <Alert variant="destructive">{errorMessage(acknowledge.error)}</Alert>
                  ) : null}
                  <div>
                    <Button onClick={() => acknowledge.mutate()} disabled={acknowledge.isPending}>
                      {acknowledge.isPending ? <Spinner /> : <CheckCheckIcon />}
                      Li e estou ciente
                    </Button>
                  </div>
                </div>
              )
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
