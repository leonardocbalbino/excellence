import type { MyAnnouncement } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { feedKey } from '@/query-keys';
import { errorMessage, useApi } from '@/services';
import { Banner, Button, Card, Label, Screen, Title } from '@/ui';

/** Comunicados: abrir registra a leitura; alguns pedem "li e estou ciente". */
export default function AnnouncementsScreen() {
  const api = useApi();
  const feed = useQuery({ queryKey: feedKey, queryFn: () => api.announcements.feed() });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Screen>
      <Button label="‹ Voltar" variant="ghost" onPress={() => router.back()} />
      <Title>Comunicados</Title>
      {feed.isError ? <Banner tone="warning">{errorMessage(feed.error)}</Banner> : null}
      {feed.data?.items.length === 0 ? (
        <Label tone="muted">Nenhum comunicado para você.</Label>
      ) : null}
      {feed.data?.items.map((item) =>
        open === item.id ? (
          <Reader key={item.id} id={item.id} onClose={() => setOpen(null)} />
        ) : (
          <Pressable key={item.id} accessibilityRole="button" onPress={() => setOpen(item.id)}>
            <Card>
              <Label style={{ fontWeight: '700' }}>{item.title}</Label>
              <Label tone={needsAttention(item) ? 'warning' : 'muted'} style={{ fontSize: 13 }}>
                {new Date(item.publishedAt).toLocaleDateString('pt-BR')}
                {!item.viewedAt ? ' · não lido' : ''}
                {item.requiresAcknowledgment && !item.acknowledgedAt ? ' · ciência pendente' : ''}
              </Label>
            </Card>
          </Pressable>
        ),
      )}
    </Screen>
  );
}

function needsAttention(item: MyAnnouncement): boolean {
  return !item.viewedAt || (item.requiresAcknowledgment && !item.acknowledgedAt);
}

function Reader({ id, onClose }: { id: string; onClose: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  // Abrir registra a leitura no servidor.
  const item = useQuery({ queryKey: [...feedKey, id], queryFn: () => api.announcements.open(id) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acknowledge = async () => {
    setBusy(true);
    try {
      await api.announcements.acknowledge(id);
      await queryClient.invalidateQueries({ queryKey: feedKey });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Label style={{ fontWeight: '700', fontSize: 17 }}>{item.data?.title ?? '…'}</Label>
      <Label>{item.data?.body ?? ''}</Label>
      {item.data?.requiresAcknowledgment ? (
        item.data.acknowledgedAt ? (
          <Label tone="primary">
            Ciência registrada em {new Date(item.data.acknowledgedAt).toLocaleString('pt-BR')}.
          </Label>
        ) : (
          <Button label="Li e estou ciente" onPress={() => void acknowledge()} loading={busy} />
        )
      ) : null}
      {error ? <Banner tone="warning">{error}</Banner> : null}
      <Button
        label="Fechar"
        variant="ghost"
        onPress={() => {
          void queryClient.invalidateQueries({ queryKey: feedKey });
          onClose();
        }}
      />
    </Card>
  );
}
