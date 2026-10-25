import { CONVERSATION_CATEGORY_LABELS, formatTicketNumber } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { conversationsKey } from '@/query-keys';
import { errorMessage, useApi } from '@/services';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  IconCircle,
  Label,
  Screen,
  Skeleton,
  styles,
  Title,
  Touchable,
} from '@/ui';

function when(iso: string): string {
  const date = new Date(iso);
  return new Date().toDateString() === date.toDateString()
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Chamados do funcionário com o RH: cada um tem um número único. */
export default function ConversationsScreen() {
  const api = useApi();
  const list = useQuery({
    queryKey: conversationsKey,
    queryFn: () => api.conversations.mine(),
    refetchInterval: 30_000,
  });

  return (
    <Screen
      title="Falar com o RH"
      subtitle="Abra um chamado e acompanhe a resposta por aqui"
      back
      refreshing={list.isFetching}
      onRefresh={() => void list.refetch()}
    >
      <Button
        label="Novo chamado"
        icon="add-circle"
        onPress={() => router.push('/atendimento/novo')}
      />
      {list.isError ? <Banner tone="warning">{errorMessage(list.error)}</Banner> : null}
      {list.isPending ? (
        <>
          <Skeleton height={84} />
          <Skeleton height={84} />
        </>
      ) : list.data?.length === 0 ? (
        <Card>
          <EmptyState
            icon="chatbubbles-outline"
            title="Nenhum chamado ainda"
            text="Dúvida sobre ponto, benefícios ou pagamento? Abra um chamado e o RH responde aqui."
          />
        </Card>
      ) : null}
      {list.data?.map((item, index) => (
        <Touchable key={item.id} onPress={() => router.push(`/atendimento/${item.id}`)}>
          <Card index={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconCircle
              name={item.status === 'closed' ? 'checkmark-done' : 'chatbubbles'}
              tone={item.unread > 0 ? 'warning' : item.status === 'closed' ? 'success' : 'primary'}
            />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={styles.row}>
                <Label tone="primary" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {formatTicketNumber(item.number)}
                </Label>
                <Label tone="muted" style={{ fontSize: 12.5 }}>
                  {when(item.lastMessage.at)}
                </Label>
              </View>
              <Title style={{ fontSize: 16 }}>{item.subject}</Title>
              <Label tone="muted" style={{ fontSize: 13 }} numberOfLines={1}>
                {item.lastMessage.side === 'hr' ? 'RH: ' : 'Você: '}
                {item.lastMessage.preview}
              </Label>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Chip label={CONVERSATION_CATEGORY_LABELS[item.category]} />
                {item.status === 'closed' ? <Chip tone="success" label="Encerrado" /> : null}
                {item.unread > 0 ? (
                  <Chip
                    tone="warning"
                    icon="mail-unread"
                    label={`${String(item.unread)} nova(s)`}
                  />
                ) : null}
              </View>
            </View>
          </Card>
        </Touchable>
      ))}
    </Screen>
  );
}
