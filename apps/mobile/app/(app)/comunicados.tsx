import type { MyAnnouncement } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { feedKey } from '@/query-keys';
import { errorMessage, useApi } from '@/services';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  haptics,
  IconCircle,
  Label,
  Screen,
  Skeleton,
  styles,
  Title,
  Touchable,
} from '@/ui';

/** Comunicados: abrir registra a leitura; alguns pedem "li e estou ciente". */
export default function AnnouncementsScreen() {
  const api = useApi();
  const feed = useQuery({ queryKey: feedKey, queryFn: () => api.announcements.feed() });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Screen
      title="Comunicados"
      back
      refreshing={feed.isFetching}
      onRefresh={() => void feed.refetch()}
    >
      {feed.isError ? <Banner tone="warning">{errorMessage(feed.error)}</Banner> : null}
      {feed.isPending ? (
        <>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </>
      ) : null}
      {feed.data?.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="megaphone-outline"
            title="Nada por aqui"
            text="Nenhum comunicado para você."
          />
        </Card>
      ) : null}
      {feed.data?.items.map((item, index) =>
        open === item.id ? (
          <Reader key={item.id} id={item.id} onClose={() => setOpen(null)} />
        ) : (
          <Touchable key={item.id} accessibilityRole="button" onPress={() => setOpen(item.id)}>
            <Card index={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconCircle name="megaphone" tone={needsAttention(item) ? 'warning' : 'primary'} />
              <View style={{ flex: 1, gap: 4 }}>
                <Label
                  style={{ fontWeight: needsAttention(item) ? '800' : '600' }}
                  numberOfLines={2}
                >
                  {item.title}
                </Label>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Chip label={new Date(item.publishedAt).toLocaleDateString('pt-BR')} />
                  {!item.viewedAt ? <Chip tone="primary" label="Não lido" /> : null}
                  {item.requiresAcknowledgment && !item.acknowledgedAt ? (
                    <Chip tone="warning" icon="hand-left" label="Ciência pendente" />
                  ) : null}
                </View>
              </View>
            </Card>
          </Touchable>
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
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: feedKey });
    } catch (e) {
      haptics.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <Title style={{ fontSize: 19, flex: 1 }}>{item.data?.title ?? '…'}</Title>
      </View>
      {item.isPending ? <Skeleton height={60} /> : <Label>{item.data?.body ?? ''}</Label>}
      {item.data?.requiresAcknowledgment ? (
        item.data.acknowledgedAt ? (
          <Banner tone="success">
            Ciência registrada em {new Date(item.data.acknowledgedAt).toLocaleString('pt-BR')}.
          </Banner>
        ) : (
          <Button
            label="Li e estou ciente"
            icon="checkmark-done"
            onPress={() => void acknowledge()}
            loading={busy}
          />
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
