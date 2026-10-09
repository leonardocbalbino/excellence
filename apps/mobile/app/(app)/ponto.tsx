import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { SelfieCapture } from '@/camera';
import { useClock } from '@/clock';
import { localTime, todayIso } from '@/format';
import { offlineQueue, useOfflineQueue } from '@/offline-queue';
import { todayEntriesKey } from '@/query-keys';
import { errorMessage, useApi, useSession } from '@/services';
import { Banner, Button, Card, Label, Screen, styles, Title, useColors } from '@/ui';

const GEOFENCE: Record<string, string> = {
  inside: 'Dentro da área do posto',
  outside: 'Fora da área do posto',
  no_location: 'Sem localização',
  no_fence: 'Posto sem cerca virtual',
};

/**
 * Registro de ponto. O horário oficial é o do servidor; sem conexão, a marcação fica no
 * aparelho com o horário em que foi feita e é enviada depois (sinalizada como offline).
 */
export default function ClockScreen() {
  const api = useApi();
  const c = useColors();
  const { settings, register } = useClock();
  const today = todayIso();
  const entries = useQuery({
    queryKey: [...todayEntriesKey, today],
    queryFn: () => api.time.mine(today, today),
  });
  const session = useSession();
  const queue = useOfflineQueue(session.status === 'authenticated' ? session.user.id : null).filter(
    (i) => i.kind === 'clock',
  );
  const [withPhoto, setWithPhoto] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const photoRequired = settings.data?.requireSelfie ?? false;
  const usePhoto = photoRequired || withPhoto;

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await register(usePhoto ? photo : null);
      setPhoto(null);
      setMessage(
        result.status === 'sent'
          ? {
              tone: 'info',
              text: `Ponto registrado às ${result.entry.localTime} · ${GEOFENCE[result.entry.geofenceStatus] ?? ''} · NSR ${result.entry.nsr}`,
            }
          : {
              tone: 'info',
              text: `Sem conexão: marcação das ${localTime(result.at)} guardada no aparelho. Ela será enviada quando a conexão voltar.`,
            },
      );
    } catch (error) {
      setMessage({ tone: 'warning', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Text
          style={{
            fontSize: 48,
            fontWeight: '800',
            textAlign: 'center',
            color: c.foreground,
            fontVariant: ['tabular-nums'],
          }}
        >
          {now.toLocaleTimeString('pt-BR')}
        </Text>
        <Label tone="muted" style={{ textAlign: 'center', fontSize: 13 }}>
          O horário registrado é o do servidor (ou o do aparelho, se estiver sem conexão).
        </Label>
        {photoRequired ? null : (
          <View style={styles.row}>
            <Label>Registrar com foto</Label>
            <Switch
              value={withPhoto}
              onValueChange={setWithPhoto}
              accessibilityLabel="Registrar com foto"
            />
          </View>
        )}
        {usePhoto ? <SelfieCapture onChange={setPhoto} /> : null}
        <Button
          label="Registrar ponto"
          onPress={() => void submit()}
          loading={busy}
          disabled={usePhoto && !photo}
        />
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      </Card>

      <Button
        label="Visualizar espelho de ponto"
        variant="outline"
        onPress={() => router.push('/espelho')}
      />

      <Card>
        <Title style={{ fontSize: 18 }}>Marcações de hoje</Title>
        {(entries.data ?? []).length === 0 && queue.length === 0 ? (
          <Label tone="muted">Nenhuma marcação hoje.</Label>
        ) : null}
        {(entries.data ?? []).map((entry) => (
          <View key={entry.id} style={styles.row}>
            <Label style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {entry.localTime}
            </Label>
            <Label
              tone={entry.geofenceStatus === 'outside' ? 'warning' : 'muted'}
              style={{ flex: 1 }}
            >
              {GEOFENCE[entry.geofenceStatus]}
              {entry.offline ? ' · feita sem conexão' : ''}
              {entry.disregarded ? ' · desconsiderada' : ''}
            </Label>
          </View>
        ))}
        {queue.map((item) => (
          <View key={item.id} style={styles.row}>
            <Label style={{ fontWeight: '700' }}>{localTime(item.createdAt)}</Label>
            <Label tone={item.status === 'failed' ? 'warning' : 'muted'} style={{ flex: 1 }}>
              {item.status === 'failed'
                ? `Não aceita: ${item.lastError ?? ''}`
                : 'Aguardando conexão para enviar'}
            </Label>
            {item.status === 'failed' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Descartar registro não aceito"
                onPress={() => void offlineQueue.discard(item.id)}
              >
                <Label tone="primary">Descartar</Label>
              </Pressable>
            ) : null}
          </View>
        ))}
        {queue.some((i) => i.status === 'failed') ? (
          <Label tone="muted" style={{ fontSize: 13 }}>
            Registro não aceito? Peça o ajuste no espelho de ponto ou fale com o RH.
          </Label>
        ) : null}
      </Card>
    </Screen>
  );
}
