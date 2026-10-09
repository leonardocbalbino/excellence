import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayIso } from '@/format';
import { useOfflineQueue } from '@/offline-queue';
import { accessQueryKey, feedKey, myPatrolsKey, todayEntriesKey } from '@/query-keys';
import { useApi, useSession } from '@/services';
import { Banner, Button, Card, Label, styles, Title, useColors } from '@/ui';

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Início: a hora, as marcações de hoje, a próxima ronda e o que está pendente. */
export default function HomeScreen() {
  const api = useApi();
  const session = useSession();
  const c = useColors();
  const now = useNow();
  const today = todayIso();
  const queue = useOfflineQueue(session.status === 'authenticated' ? session.user.id : null);
  const access = useQuery({ queryKey: accessQueryKey, queryFn: () => api.access.mine() });
  const personal = access.data?.hasEmployeeRecord ?? false;
  const entries = useQuery({
    queryKey: [...todayEntriesKey, today],
    queryFn: () => api.time.mine(today, today),
    enabled: personal,
  });
  const patrols = useQuery({
    queryKey: myPatrolsKey,
    queryFn: () => api.patrols.mine(),
    enabled: access.data?.hasPatrolRoutes ?? false,
  });
  const feed = useQuery({ queryKey: feedKey, queryFn: () => api.announcements.feed() });

  const firstName = session.status === 'authenticated' ? session.user.name.split(' ')[0] : '';
  const effective = (entries.data ?? []).filter((e) => e.kind !== 'disregard' && !e.disregarded);
  const queuedClocks = queue.filter((i) => i.kind === 'clock' && i.status === 'pending').length;
  const count = effective.length + queuedClocks;
  const failed = queue.filter((i) => i.status === 'failed').length;
  const pendingSync = queue.filter((i) => i.status === 'pending').length;
  const next = patrols.data?.routes
    .flatMap((route) => route.slots.map((slot) => ({ route, slot })))
    .filter(({ slot }) => slot.status === 'upcoming')
    .sort((a, b) => a.slot.at.localeCompare(b.slot.at))[0];
  const refreshing = entries.isFetching || feed.isFetching || patrols.isFetching;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.padded, styles.gap]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void entries.refetch();
              void feed.refetch();
              void patrols.refetch();
            }}
          />
        }
      >
        <Label tone="muted">
          {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Label>
        <Title>Olá, {firstName}</Title>

        {session.status === 'authenticated' && session.offline ? (
          <Banner tone="warning">
            Sem conexão. Dá para registrar ponto e ler pontos da ronda: tudo é enviado quando a
            conexão voltar.
          </Banner>
        ) : null}
        {pendingSync > 0 ? (
          <Banner tone="info">
            {pendingSync} registro(s) feitos sem conexão aguardando envio. Eles saem sozinhos quando
            a conexão voltar.
          </Banner>
        ) : null}
        {failed > 0 ? (
          <Banner tone="warning">
            {failed} registro(s) não foram aceitos pelo servidor. Veja em Ponto ou Rondas.
          </Banner>
        ) : null}

        {personal ? (
          <View style={{ backgroundColor: c.primary, borderRadius: 20, padding: 20, gap: 12 }}>
            <Text
              style={{ color: '#ffffff', fontSize: 56, fontWeight: '800', textAlign: 'center' }}
              accessibilityLabel={`Agora são ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
            >
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Button
              label={count % 2 === 0 ? 'Registrar entrada' : 'Registrar saída'}
              variant="inverse"
              onPress={() => router.push('/ponto')}
            />
            <View
              style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}
            >
              {effective.map((entry) => (
                <View
                  key={entry.id}
                  style={{
                    backgroundColor: '#00000033',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{ color: '#ffffff', fontVariant: ['tabular-nums'], fontWeight: '600' }}
                  >
                    {entry.localTime}
                  </Text>
                </View>
              ))}
              {effective.length === 0 && queuedClocks === 0 ? (
                <Text style={{ color: '#ffffffcc' }}>Nenhuma marcação hoje.</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {patrols.data?.current ? (
          <Card>
            <Title style={{ fontSize: 18 }}>Ronda em andamento</Title>
            <Label>
              {patrols.data.current.route.name} · {patrols.data.current.checked} de{' '}
              {patrols.data.current.total} pontos
            </Label>
            <Button label="Continuar e ler QR code" onPress={() => router.push('/rondas')} />
          </Card>
        ) : next ? (
          <Card>
            <View style={styles.row}>
              <Title style={{ fontSize: 18 }}>Próxima ronda</Title>
              <Label tone="primary" style={{ fontWeight: '700' }}>
                {next.slot.localTime}
              </Label>
            </View>
            <Label>
              {next.route.name} · {next.route.pointsCount} pontos · previsão de{' '}
              {next.route.expectedMinutes} min
            </Label>
            <Button label="Iniciar e ler QR code" onPress={() => router.push('/rondas')} />
          </Card>
        ) : null}

        {feed.data && feed.data.pending > 0 ? (
          <Card>
            <Title style={{ fontSize: 18 }}>Comunicados</Title>
            <Label>{feed.data.pending} aguardando sua leitura.</Label>
            <Button
              label="Ler agora"
              variant="outline"
              onPress={() => router.push('/comunicados')}
            />
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
