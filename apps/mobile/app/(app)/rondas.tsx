import type { MyPatrols, PatrolRun } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { QrScanner } from '@/camera';
import { currentPosition, newKey } from '@/device';
import { localTime } from '@/format';
import { offlineQueue, useOfflineQueue } from '@/offline-queue';
import { myPatrolsKey } from '@/query-keys';
import { errorMessage, isRetryable, useApi, useSession } from '@/services';
import { Banner, Button, Card, Label, Screen, styles, Title, useColors } from '@/ui';

const SLOT: Record<string, string> = {
  upcoming: 'Prevista',
  in_progress: 'Em andamento',
  done: 'Feita',
  missed: 'Não iniciada',
};

/**
 * Rondas: a ronda começa com conexão (o servidor cria a ronda); os check-ins dos pontos podem
 * ser feitos sem sinal e vão para a fila com o horário da leitura.
 */
export default function PatrolsScreen() {
  const api = useApi();
  const mine = useQuery({ queryKey: myPatrolsKey, queryFn: () => api.patrols.mine() });

  return (
    <Screen>
      <Title>Rondas</Title>
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
      queryClient.setQueryData<MyPatrols>(myPatrolsKey, (old) =>
        old ? { ...old, current: run } : old,
      );
    } catch (e) {
      setError(
        isRetryable(e)
          ? 'Para iniciar a ronda é preciso conexão. Depois de iniciada, os pontos podem ser lidos sem sinal.'
          : errorMessage(e),
      );
    } finally {
      setStarting(null);
    }
  };

  if (loading) return <Label tone="muted">Carregando…</Label>;
  if (routes.length === 0) {
    return <Banner tone="info">Nenhuma rota de ronda está atribuída a você.</Banner>;
  }
  return (
    <>
      {error ? <Banner tone="warning">{error}</Banner> : null}
      {routes.map((route) => (
        <Card key={route.id}>
          <Title style={{ fontSize: 18 }}>{route.name}</Title>
          <Label tone="muted">
            {route.unit.name} · {route.pointsCount} pontos · {route.expectedMinutes} min
          </Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {route.slots.map((slot) => (
              <Label
                key={slot.at}
                tone={slot.status === 'missed' ? 'warning' : 'muted'}
                style={{ fontSize: 13 }}
              >
                {slot.localTime} {SLOT[slot.status]}
              </Label>
            ))}
          </View>
          <Button
            label="Iniciar e ler QR code"
            onPress={() => void start(route.id)}
            loading={starting === route.id}
          />
        </Card>
      ))}
    </>
  );
}

function RunInProgress({ run }: { run: PatrolRun }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const c = useColors();
  const session = useSession();
  const userId = session.status === 'authenticated' ? session.user.id : null;
  const queued = useOfflineQueue(userId).filter((i) => i.kind === 'checkin' && i.runId === run.id);
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);

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
      setMessage({
        tone: 'info',
        text:
          next.status === 'completed'
            ? `Ronda concluída: ${String(next.total)} pontos.`
            : `Ponto registrado. Próximo: ${next.nextPoint?.name ?? '—'}.`,
      });
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
        setMessage({
          tone: 'info',
          text: `Sem sinal: leitura das ${localTime(at)} guardada. Ela será enviada quando a conexão voltar.`,
        });
      } else {
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
      setRun(next);
      await queryClient.invalidateQueries({ queryKey: myPatrolsKey });
    } catch (error) {
      setMessage({
        tone: 'warning',
        text: isRetryable(error) ? 'Para encerrar a ronda é preciso conexão.' : errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const queuedCodes = queued.map((q) => q.input.code);
  const missing = run.total - run.checked - queued.filter((q) => q.status === 'pending').length;

  return (
    <>
      <View style={{ backgroundColor: c.primary, borderRadius: 20, padding: 18, gap: 6 }}>
        <Title style={{ color: '#ffffff' }}>{run.route.name}</Title>
        <Label style={{ color: '#ffffffd9' }}>
          {run.checked} de {run.total} pontos · iniciada às {localTime(run.startedAt)}
          {run.lateMinutes > 0 ? ` · atrasada ${String(run.lateMinutes)} min` : ''}
        </Label>
        {run.nextPoint ? (
          <Label style={{ color: '#ffffff', fontWeight: '700' }}>
            Próximo: {run.nextPoint.name}
          </Label>
        ) : null}
      </View>

      {scanning ? <QrScanner onCode={(code) => void onCode(code)} paused={busy} /> : null}
      <Button
        label={scanning ? 'Fechar câmera' : 'Ler QR code'}
        variant={scanning ? 'outline' : 'primary'}
        onPress={() => setScanning((s) => !s)}
      />
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <Card>
        <Title style={{ fontSize: 18 }}>Pontos</Title>
        {run.points.map((point, index) => {
          const isQueued = queuedCodes.some((code) => code.includes(point.id));
          return (
            <View key={point.id} style={styles.row}>
              <Label style={{ flex: 1 }}>
                {index + 1}. {point.name}
              </Label>
              <Label tone={point.checkin ? 'primary' : isQueued ? 'muted' : 'muted'}>
                {point.checkin
                  ? `${point.checkin.localTime}${point.checkin.offline ? ' (sem sinal)' : ''}`
                  : isQueued
                    ? 'na fila'
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

      <Card>
        <Title style={{ fontSize: 18 }}>Encerrar ronda</Title>
        {missing > 0 ? (
          <>
            <Label tone="muted">
              Faltam {missing} ponto(s). Explique o motivo para encerrar assim.
            </Label>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              accessibilityLabel="Motivo"
              placeholder="Ex.: acesso ao galpão bloqueado."
              placeholderTextColor={c.mutedForeground}
              style={[
                styles.label,
                {
                  minHeight: 80,
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 12,
                  padding: 12,
                  color: c.foreground,
                  textAlignVertical: 'top',
                },
              ]}
            />
          </>
        ) : (
          <Label tone="muted">Todos os pontos foram lidos.</Label>
        )}
        <Button
          label="Encerrar ronda"
          variant="outline"
          onPress={() => void finish()}
          loading={busy}
          disabled={missing > 0 && !note.trim()}
        />
      </Card>
    </>
  );
}
