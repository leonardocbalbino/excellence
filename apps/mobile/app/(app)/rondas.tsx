import type { MyPatrols, PatrolRun } from '@excellence/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { QrScanner, type ScanFeedback } from '@/camera';
import { currentPosition, newKey } from '@/device';
import { localTime } from '@/format';
import { offlineQueue, type QueueItem, useOfflineQueue } from '@/offline-queue';
import { myPatrolsKey } from '@/query-keys';
import { errorMessage, isRetryable, useApi, useSession } from '@/services';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Hero,
  haptics,
  IconCircle,
  Label,
  ProgressBar,
  Screen,
  SectionTitle,
  Skeleton,
  styles,
  TextField,
  Title,
  useColors,
} from '@/ui';

const SLOT: Record<string, { label: string; tone: 'primary' | 'success' | 'warning' | 'muted' }> = {
  upcoming: { label: 'Prevista', tone: 'primary' },
  in_progress: { label: 'Em andamento', tone: 'primary' },
  done: { label: 'Feita', tone: 'success' },
  missed: { label: 'Não iniciada', tone: 'warning' },
};

type CheckinItem = Extract<QueueItem, { kind: 'checkin' }>;

/**
 * Rondas (ADR 0016, ADR 0019): a ronda começa com conexão (o servidor cria a ronda); os
 * check-ins dos pontos podem ser feitos sem sinal e vão para a fila com o horário da leitura.
 */
export default function PatrolsScreen() {
  const api = useApi();
  const mine = useQuery({ queryKey: myPatrolsKey, queryFn: () => api.patrols.mine() });

  return (
    <Screen
      title="Rondas"
      subtitle={mine.data?.current ? 'Ronda em andamento' : 'Seus horários de hoje'}
      refreshing={mine.isFetching}
      onRefresh={() => void mine.refetch()}
    >
      {mine.isError ? <Banner tone="warning">{errorMessage(mine.error)}</Banner> : null}
      {mine.data?.current ? (
        <RunInProgress run={mine.data.current} />
      ) : (
        <RouteList routes={mine.data?.routes ?? []} loading={mine.isPending} />
      )}
    </Screen>
  );
}

function RouteList({ routes, loading }: { routes: MyPatrols['routes']; loading: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (routeId: string) => {
    setStarting(routeId);
    setError(null);
    try {
      const run = await api.patrols.start(routeId, newKey());
      haptics.success();
      queryClient.setQueryData<MyPatrols>(myPatrolsKey, (old) =>
        old ? { ...old, current: run } : old,
      );
    } catch (e) {
      haptics.error();
      setError(
        isRetryable(e)
          ? 'Para iniciar a ronda é preciso conexão. Depois de iniciada, os pontos podem ser lidos sem sinal.'
          : errorMessage(e),
      );
    } finally {
      setStarting(null);
    }
  };

  if (loading) {
    return (
      <>
        <Skeleton height={150} />
        <Skeleton height={150} />
      </>
    );
  }
  if (routes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="map-outline"
          title="Nenhuma rota atribuída"
          text="Quando o gestor atribuir uma rota de ronda a você, ela aparece aqui."
        />
      </Card>
    );
  }
  return (
    <>
      {error ? <Banner tone="warning">{error}</Banner> : null}
      {routes.map((route, index) => {
        const next = route.slots.find((s) => s.status === 'upcoming');
        return (
          <Card key={route.id} index={index}>
            <View style={[styles.row, { justifyContent: 'flex-start', gap: 12 }]}>
              <IconCircle name="shield-checkmark" />
              <View style={{ flex: 1 }}>
                <Title style={{ fontSize: 18 }}>{route.name}</Title>
                <Label tone="muted" style={{ fontSize: 13 }}>
                  {route.unit.name} · {route.pointsCount} pontos · {route.expectedMinutes} min
                </Label>
              </View>
            </View>
            {route.slots.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {route.slots.map((slot) => {
                  const meta = SLOT[slot.status] ?? { label: slot.status, tone: 'muted' as const };
                  return (
                    <Chip
                      key={slot.at}
                      tone={meta.tone}
                      icon={slot.status === 'done' ? 'checkmark' : 'time-outline'}
                      label={`${slot.localTime} · ${meta.label}`}
                    />
                  );
                })}
              </View>
            ) : (
              <Label tone="muted" style={{ fontSize: 13 }}>
                Sem horário previsto hoje.
              </Label>
            )}
            <Button
              label={next ? `Iniciar ronda das ${next.localTime}` : 'Iniciar ronda'}
              icon="qr-code"
              onPress={() => void start(route.id)}
              loading={starting === route.id}
            />
          </Card>
        );
      })}
    </>
  );
}

function RunInProgress({ run }: { run: PatrolRun }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const c = useColors();
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.user.id : null;
  const queued = useOfflineQueue(userId).filter(
    (i): i is CheckinItem => i.kind === 'checkin' && i.runId === run.id,
  );
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const [message, setMessage] = useState<{
    tone: 'success' | 'info' | 'warning';
    text: string;
  } | null>(null);

  const setRun = (next: PatrolRun) =>
    queryClient.setQueryData<MyPatrols>(myPatrolsKey, (old) =>
      old ? { ...old, current: next.status === 'in_progress' ? next : null } : old,
    );

  const onCode = async (code: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const at = new Date().toISOString();
    const position = await currentPosition(6_000);
    const input = {
      code,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      accuracyMeters: position?.accuracyMeters ?? null,
      deviceTimestamp: at,
    };
    try {
      const next = await api.patrols.checkin(run.id, input, newKey());
      setRun(next);
      haptics.success();
      setFeedback({ tone: 'success', at: Date.now() });
      setMessage({
        tone: 'success',
        text:
          next.status === 'completed'
            ? `Ronda concluída: ${String(next.total)} pontos.`
            : `Ponto registrado. Próximo: ${next.nextPoint?.name ?? '—'}.`,
      });
      if (next.status === 'completed')
        await queryClient.invalidateQueries({ queryKey: myPatrolsKey });
    } catch (error) {
      if (isRetryable(error) && userId) {
        await offlineQueue.enqueue({
          id: newKey(),
          userId,
          kind: 'checkin',
          runId: run.id,
          routeName: run.route.name,
          createdAt: at,
          status: 'pending',
          lastError: null,
          input: { ...input, offlineRecordedAt: at },
        });
        haptics.warning();
        setFeedback({ tone: 'success', at: Date.now() });
        setMessage({
          tone: 'info',
          text: `Sem sinal: leitura das ${localTime(at)} guardada. Ela é enviada quando a conexão voltar.`,
        });
      } else {
        haptics.error();
        setFeedback({ tone: 'error', at: Date.now() });
        setMessage({ tone: 'warning', text: errorMessage(error) });
      }
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (userId) await offlineQueue.flush(api, userId);
      const next = await api.patrols.finish(run.id, { note: note.trim() || null });
      haptics.success();
      setRun(next);
      await queryClient.invalidateQueries({ queryKey: myPatrolsKey });
    } catch (error) {
      haptics.error();
      setMessage({
        tone: 'warning',
        text: isRetryable(error) ? 'Para encerrar a ronda é preciso conexão.' : errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const pendingCodes = queued.filter((q) => q.status === 'pending').map((q) => q.input.code);
  const done = run.checked + pendingCodes.length;
  const missing = Math.max(0, run.total - done);

  return (
    <>
      <Hero>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Label tone="inverse" style={{ opacity: 0.8, fontSize: 13 }}>
              Iniciada às {localTime(run.startedAt)}
            </Label>
            <Title style={{ color: '#ffffff' }}>{run.route.name}</Title>
          </View>
          <Animated.Text
            key={done}
            entering={ZoomIn.springify()}
            style={{
              color: '#ffffff',
              fontSize: 34,
              fontWeight: '800',
              fontVariant: ['tabular-nums'],
            }}
          >
            {done}/{run.total}
          </Animated.Text>
        </View>
        <ProgressBar value={run.total > 0 ? done / run.total : 0} tone="inverse" />
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {run.nextPoint ? (
            <Chip tone="inverse" icon="navigate" label={`Próximo: ${run.nextPoint.name}`} />
          ) : null}
          {run.lateMinutes > 0 ? (
            <Chip tone="inverse" icon="alarm" label={`Atrasada ${String(run.lateMinutes)} min`} />
          ) : null}
        </View>
      </Hero>

      {scanning ? (
        <QrScanner onCode={(code) => void onCode(code)} paused={busy} feedback={feedback} />
      ) : null}
      <Button
        label={scanning ? 'Fechar câmera' : 'Ler QR code'}
        variant={scanning ? 'soft' : 'primary'}
        icon={scanning ? 'close' : 'qr-code'}
        onPress={() => setScanning((s) => !s)}
      />
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <SectionTitle>Pontos</SectionTitle>
      <Card>
        {run.points.map((point, index) => {
          const isQueued = pendingCodes.some((code) => code.includes(point.id));
          const checked = point.checkin !== null;
          const isNext = run.nextPoint?.id === point.id;
          return (
            <View
              key={point.id}
              style={[
                styles.row,
                {
                  paddingVertical: 8,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  backgroundColor: isNext ? c.primarySoft : 'transparent',
                },
              ]}
            >
              <View style={[styles.row, { flex: 1, justifyContent: 'flex-start', gap: 10 }]}>
                {checked ? (
                  <Animated.View entering={ZoomIn.springify().damping(10)}>
                    <Ionicons name="checkmark-circle" size={26} color={c.success} />
                  </Animated.View>
                ) : isQueued ? (
                  <Ionicons name="cloud-upload-outline" size={24} color={c.mutedForeground} />
                ) : (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: isNext ? c.primary : c.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Label style={{ fontSize: 11, fontWeight: '800' }}>{index + 1}</Label>
                  </View>
                )}
                <Label style={{ flex: 1, fontWeight: isNext ? '700' : '500' }}>{point.name}</Label>
              </View>
              <Label tone={checked ? 'success' : 'muted'} style={{ fontSize: 13 }}>
                {point.checkin
                  ? `${point.checkin.localTime}${point.checkin.offline ? ' · sem sinal' : ''}`
                  : isQueued
                    ? 'na fila'
                    : isNext
                      ? 'próximo'
                      : '—'}
              </Label>
            </View>
          );
        })}
        {queued
          .filter((q) => q.status === 'failed')
          .map((q) => (
            <Banner key={q.id} tone="warning">
              Leitura das {localTime(q.createdAt)} não aceita: {q.lastError}
            </Banner>
          ))}
      </Card>

      <Animated.View entering={FadeInDown.delay(150)}>
        <Card>
          <Title style={{ fontSize: 18 }}>Encerrar ronda</Title>
          {missing > 0 ? (
            <TextField
              label={`Faltam ${String(missing)} ponto(s). Explique o motivo`}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Ex.: acesso ao galpão bloqueado."
            />
          ) : (
            <Label tone="success" style={{ fontWeight: '700' }}>
              Todos os pontos foram lidos.
            </Label>
          )}
          <Button
            label="Encerrar ronda"
            variant={missing > 0 ? 'outline' : 'primary'}
            icon="flag"
            onPress={() => void finish()}
            loading={busy}
            disabled={missing > 0 && !note.trim()}
          />
        </Card>
      </Animated.View>
    </>
  );
}
