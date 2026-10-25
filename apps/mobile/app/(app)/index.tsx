import { useQuery } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar } from '@/avatar';
import { formatMinutes, todayIso } from '@/format';
import { useOfflineQueue } from '@/offline-queue';
import {
  accessQueryKey,
  conversationsUnreadKey,
  feedKey,
  myPatrolsKey,
  todayEntriesKey,
} from '@/query-keys';
import { useApi, useSession } from '@/services';
import {
  Banner,
  Button,
  Card,
  Chip,
  Hero,
  IconCircle,
  type IconName,
  Label,
  Screen,
  SectionTitle,
  styles,
  Title,
  Touchable,
  useColors,
} from '@/ui';

function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "em 12 min", "em 1h05", "agora". */
function until(at: string, now: Date): string {
  const minutes = Math.round((new Date(at).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return 'agora';
  return minutes < 60 ? `em ${String(minutes)} min` : `em ${formatMinutes(minutes)}`;
}

/** Início: a hora, como está o dia no ponto, a próxima ronda e atalhos. */
export default function HomeScreen() {
  const api = useApi();
  const session = useSession();
  const c = useColors();
  const now = useNow();
  const today = todayIso();
  const queue = useOfflineQueue(session.status === 'authenticated' ? session.user.id : null);
  const access = useQuery({ queryKey: accessQueryKey, queryFn: () => api.access.mine() });
  const entries = useQuery({
    queryKey: [...todayEntriesKey, today],
    queryFn: () => api.time.mine(today, today),
  });
  const hasRoutes = access.data?.hasPatrolRoutes ?? false;
  const patrols = useQuery({
    queryKey: myPatrolsKey,
    queryFn: () => api.patrols.mine(),
    enabled: hasRoutes,
  });
  const feed = useQuery({ queryKey: feedKey, queryFn: () => api.announcements.feed() });
  const unread = useQuery({
    queryKey: conversationsUnreadKey,
    queryFn: () => api.conversations.myUnread(),
  });

  const firstName = session.status === 'authenticated' ? session.user.name.split(' ')[0] : '';
  const effective = (entries.data ?? []).filter((e) => e.kind !== 'disregard' && !e.disregarded);
  const queuedClocks = queue.filter((i) => i.kind === 'clock' && i.status === 'pending').length;
  const count = effective.length + queuedClocks;
  const working = count % 2 === 1;
  const lastEntry = effective.at(-1);
  const failed = queue.filter((i) => i.status === 'failed').length;
  const pendingSync = queue.filter((i) => i.status === 'pending').length;
  const next = patrols.data?.routes
    .flatMap((route) => route.slots.map((slot) => ({ route, slot })))
    .filter(({ slot }) => slot.status === 'upcoming')
    .sort((a, b) => a.slot.at.localeCompare(b.slot.at))[0];
  const offline = session.status === 'authenticated' && session.offline;

  const status = (() => {
    if (count === 0) return 'Você ainda não registrou o ponto hoje.';
    if (!lastEntry) return `${String(count)} marcação(ões) aguardando envio.`;
    if (working) {
      const [h = 0, m = 0] = lastEntry.localTime.split(':').map(Number);
      const since = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
      return since > 0
        ? `Em jornada desde ${lastEntry.localTime} · há ${formatMinutes(since)}`
        : `Em jornada desde ${lastEntry.localTime}`;
    }
    return `Última saída às ${lastEntry.localTime}.`;
  })();

  const shortcuts: { label: string; icon: IconName; to: Href; badge?: number }[] = [
    { label: 'Bater ponto', icon: 'finger-print', to: '/ponto' },
    ...(hasRoutes ? [{ label: 'Rondas', icon: 'qr-code' as const, to: '/rondas' as const }] : []),
    { label: 'Benefícios', icon: 'gift', to: '/beneficios' },
    { label: 'Espelho', icon: 'calendar', to: '/espelho' },
    { label: 'Comunicados', icon: 'megaphone', to: '/comunicados', badge: feed.data?.pending ?? 0 },
    {
      label: 'Falar com o RH',
      icon: 'chatbubbles',
      to: '/atendimento',
      badge: unread.data?.conversations ?? 0,
    },
  ];

  return (
    <Screen
      refreshing={entries.isFetching || feed.isFetching || patrols.isFetching}
      onRefresh={() => {
        void entries.refetch();
        void feed.refetch();
        void patrols.refetch();
      }}
    >
      <Animated.View
        entering={FadeInDown.springify().damping(18)}
        style={[styles.row, { justifyContent: 'flex-start', gap: 14 }]}
      >
        {session.status === 'authenticated' ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Meu perfil"
            onPress={() => router.push('/perfil')}
          >
            <Avatar name={session.user.name} size={54} />
          </Touchable>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Label tone="muted" style={{ textTransform: 'capitalize' }}>
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Label>
          <Text
            style={[styles.screenTitle, { color: c.foreground, fontSize: 26 }]}
            numberOfLines={1}
          >
            {greeting(now)}, {firstName} 👋
          </Text>
        </View>
      </Animated.View>

      {offline ? (
        <Banner tone="warning">
          Sem conexão. Dá para registrar ponto e ler pontos da ronda: tudo é enviado quando a
          conexão voltar.
        </Banner>
      ) : null}
      {pendingSync > 0 ? (
        <Banner tone="info">
          {pendingSync} registro(s) feitos sem conexão aguardando envio. Eles saem sozinhos.
        </Banner>
      ) : null}
      {failed > 0 ? (
        <Banner tone="warning">
          {failed} registro(s) não foram aceitos pelo servidor. Veja em Ponto ou Rondas.
        </Banner>
      ) : null}

      <Hero>
        <View style={styles.row}>
          <Chip
            tone="inverse"
            icon={working ? 'radio-button-on' : 'moon'}
            label={working ? 'Em jornada' : 'Fora da jornada'}
          />
          <Label tone="inverse" style={{ opacity: 0.8, fontSize: 13 }}>
            {count} marcação(ões) hoje
          </Label>
        </View>
        <Text
          style={{
            color: '#fff',
            fontSize: 64,
            fontWeight: '800',
            letterSpacing: -2,
            fontVariant: ['tabular-nums'],
          }}
          accessibilityLabel={`Agora são ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
        >
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Label tone="inverse" style={{ opacity: 0.9 }}>
          {status}
        </Label>
        <Button
          label={working ? 'Registrar saída' : 'Registrar entrada'}
          variant="inverse"
          icon="finger-print"
          onPress={() => router.push('/ponto')}
        />
      </Hero>

      {patrols.data?.current ? (
        <Card index={1} style={{ borderColor: c.primary, borderWidth: 2 }}>
          <View style={[styles.row, { justifyContent: 'flex-start', gap: 12 }]}>
            <IconCircle name="walk" />
            <View style={{ flex: 1 }}>
              <Title style={{ fontSize: 18 }}>Ronda em andamento</Title>
              <Label tone="muted">
                {patrols.data.current.route.name} · {patrols.data.current.checked} de{' '}
                {patrols.data.current.total} pontos
              </Label>
            </View>
          </View>
          <Button
            label="Continuar e ler QR code"
            icon="qr-code"
            onPress={() => router.push('/rondas')}
          />
        </Card>
      ) : next ? (
        <Card index={1}>
          <View style={[styles.row, { justifyContent: 'flex-start', gap: 12 }]}>
            <IconCircle name="shield-checkmark" />
            <View style={{ flex: 1 }}>
              <Title style={{ fontSize: 18 }}>Próxima ronda · {next.slot.localTime}</Title>
              <Label tone="muted">
                {next.route.name} · {next.route.pointsCount} pontos · {next.route.expectedMinutes}{' '}
                min
              </Label>
            </View>
            <Chip tone="primary" icon="time" label={until(next.slot.at, now)} />
          </View>
          <Button
            label="Iniciar e ler QR code"
            icon="qr-code"
            onPress={() => router.push('/rondas')}
          />
        </Card>
      ) : null}

      {feed.data && feed.data.pending > 0 ? (
        <Touchable onPress={() => router.push('/comunicados')}>
          <Card index={2} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconCircle name="megaphone" tone="warning" />
            <View style={{ flex: 1 }}>
              <Title style={{ fontSize: 17 }}>
                {feed.data.pending} comunicado{feed.data.pending > 1 ? 's' : ''} para ler
              </Title>
              <Label tone="muted" style={{ fontSize: 13 }}>
                Toque para abrir
              </Label>
            </View>
          </Card>
        </Touchable>
      ) : null}

      <SectionTitle>Atalhos</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {shortcuts.map((item, index) => (
          <Animated.View
            key={item.label}
            entering={FadeInDown.delay(120 + index * 50)
              .springify()
              .damping(16)}
            style={{ width: '47.5%' }}
          >
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => router.push(item.to)}
              style={{
                backgroundColor: c.card,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: 20,
                padding: 16,
                gap: 10,
              }}
            >
              <View style={styles.row}>
                <IconCircle name={item.icon} />
                {item.badge && item.badge > 0 ? (
                  <Chip tone="warning" label={String(item.badge)} />
                ) : null}
              </View>
              <Label style={{ fontWeight: '700' }}>{item.label}</Label>
            </Touchable>
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}
