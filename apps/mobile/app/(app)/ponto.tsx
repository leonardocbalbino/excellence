import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SelfieCapture } from '@/camera';
import { ClockButton, type ClockButtonState } from '@/clock-button';
import { useClock } from '@/clock';
import { localTime, todayIso } from '@/format';
import { offlineQueue, useOfflineQueue } from '@/offline-queue';
import { todayEntriesKey } from '@/query-keys';
import { errorMessage, useApi, useSession } from '@/services';
import {
  Banner,
  Button,
  Card,
  Chip,
  Hero,
  haptics,
  Label,
  Screen,
  SectionTitle,
  styles,
  Touchable,
  useColors,
} from '@/ui';

const GEOFENCE: Record<string, { label: string; tone: 'success' | 'warning' | 'muted' }> = {
  inside: { label: 'No posto', tone: 'success' },
  outside: { label: 'Fora do posto', tone: 'warning' },
  no_location: { label: 'Sem localização', tone: 'muted' },
  no_fence: { label: 'Posto sem cerca', tone: 'muted' },
};

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Registro de ponto (ADR 0012, ADR 0019). O horário oficial é o do servidor; sem conexão, a
 * marcação fica no aparelho com o horário em que foi feita e é enviada depois (sinalizada
 * como offline, até 72 h). Localização e foto seguem a configuração da empresa: com a
 * localização exigida, sem GPS não registra; com a foto exigida, a selfie vem antes.
 */
export default function ClockScreen() {
  const api = useApi();
  const c = useColors();
  const now = useNow();
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
  const [state, setState] = useState<ClockButtonState>('idle');
  const [message, setMessage] = useState<{
    tone: 'success' | 'info' | 'warning';
    text: string;
  } | null>(null);

  const photoRequired = settings.data?.requireSelfie ?? false;
  const locationRequired = settings.data?.requireLocation ?? false;
  const usePhoto = photoRequired || withPhoto;
  const effective = (entries.data ?? []).filter((e) => e.kind !== 'disregard' && !e.disregarded);
  const pendingQueue = queue.filter((i) => i.status === 'pending');
  const count = effective.length + pendingQueue.length;
  const nextLabel = count % 2 === 0 ? 'Registrar entrada' : 'Registrar saída';
  const offline = session.status === 'authenticated' && session.offline;

  const submit = async () => {
    setState('busy');
    setMessage(null);
    try {
      const result = await register(usePhoto ? photo : null);
      setPhoto(null);
      setState('success');
      haptics.success();
      setMessage(
        result.status === 'sent'
          ? {
              tone: 'success',
              text: `Ponto registrado às ${result.entry.localTime} · ${GEOFENCE[result.entry.geofenceStatus]?.label ?? ''} · NSR ${result.entry.nsr}`,
            }
          : {
              tone: 'info',
              text: `Sem conexão: marcação das ${localTime(result.at)} guardada no aparelho. Ela é enviada sozinha quando a conexão voltar.`,
            },
      );
    } catch (error) {
      setState('error');
      haptics.error();
      setMessage({ tone: 'warning', text: errorMessage(error) });
    } finally {
      setTimeout(() => setState('idle'), 2200);
    }
  };

  return (
    <Screen
      title="Ponto"
      subtitle={now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
      refreshing={entries.isFetching}
      onRefresh={() => void entries.refetch()}
    >
      <Hero style={{ alignItems: 'center', gap: 6 }}>
        <Text
          style={{
            color: '#ffffff',
            fontSize: 60,
            fontWeight: '800',
            fontVariant: ['tabular-nums'],
            letterSpacing: -1,
          }}
          accessibilityLabel={`Agora são ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
        >
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          <Text style={{ fontSize: 26, color: '#ffffffaa' }}>
            :{String(now.getSeconds()).padStart(2, '0')}
          </Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {locationRequired ? (
            <Chip tone="inverse" icon="location" label="Localização exigida" />
          ) : null}
          {photoRequired ? <Chip tone="inverse" icon="camera" label="Foto exigida" /> : null}
          {offline ? <Chip tone="inverse" icon="cloud-offline" label="Sem conexão" /> : null}
        </View>

        {usePhoto && !photo ? (
          <View style={{ width: '100%', marginTop: 8 }}>
            <SelfieCapture onChange={setPhoto} />
          </View>
        ) : (
          <ClockButton label={nextLabel} state={state} onPress={() => void submit()} />
        )}
        {usePhoto && photo ? (
          <Label tone="inverse" style={{ opacity: 0.85, fontSize: 13 }}>
            Foto pronta. Toque no botão para registrar.
          </Label>
        ) : null}
        <Label tone="inverse" style={{ opacity: 0.8, fontSize: 12.5, textAlign: 'center' }}>
          Vale o horário do servidor (ou o do aparelho, se estiver sem conexão).
        </Label>
      </Hero>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      {photoRequired ? null : (
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Label style={{ fontWeight: '700' }}>Registrar com foto</Label>
              <Label tone="muted" style={{ fontSize: 13 }}>
                Opcional. Tira uma selfie junto com a marcação.
              </Label>
            </View>
            <Switch
              value={withPhoto}
              onValueChange={(value) => {
                setWithPhoto(value);
                if (!value) setPhoto(null);
              }}
              trackColor={{ true: c.primary }}
              accessibilityLabel="Registrar com foto"
            />
          </View>
        </Card>
      )}

      <SectionTitle
        action={
          <Touchable
            accessibilityRole="button"
            onPress={() => router.push('/espelho')}
            style={{ paddingVertical: 4 }}
          >
            <Label tone="primary" style={{ fontWeight: '700' }}>
              Ver espelho ›
            </Label>
          </Touchable>
        }
      >
        Hoje
      </SectionTitle>
      <Card>
        {effective.length === 0 && queue.length === 0 ? (
          <Label tone="muted">Nenhuma marcação hoje. Toque no botão acima para registrar.</Label>
        ) : null}
        {effective.map((entry, index) => {
          const geo = GEOFENCE[entry.geofenceStatus];
          return (
            <Animated.View
              key={entry.id}
              entering={FadeInRight.delay(index * 70).springify()}
              style={[styles.row, { justifyContent: 'flex-start', gap: 12 }]}
            >
              <Timeline
                first={index === 0}
                last={index === effective.length - 1 && queue.length === 0}
                tone={c.primary}
              />
              <View style={{ flex: 1, paddingVertical: 8 }}>
                <Label style={{ fontWeight: '800', fontSize: 18, fontVariant: ['tabular-nums'] }}>
                  {entry.localTime}
                </Label>
                <Label tone="muted" style={{ fontSize: 13 }}>
                  {index % 2 === 0 ? 'Entrada' : 'Saída'}
                </Label>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {geo ? <Chip tone={geo.tone} label={geo.label} /> : null}
                {entry.offline ? (
                  <Chip tone="muted" icon="cloud-offline" label="Sem conexão" />
                ) : null}
              </View>
            </Animated.View>
          );
        })}
        {queue.map((item, index) => (
          <Animated.View
            key={item.id}
            entering={FadeInDown.springify()}
            style={[styles.row, { justifyContent: 'flex-start', gap: 12 }]}
          >
            <Timeline
              first={effective.length === 0 && index === 0}
              last={index === queue.length - 1}
              tone={item.status === 'failed' ? c.warning : c.mutedForeground}
            />
            <View style={{ flex: 1, paddingVertical: 8 }}>
              <Label style={{ fontWeight: '800', fontSize: 18 }}>{localTime(item.createdAt)}</Label>
              <Label tone={item.status === 'failed' ? 'warning' : 'muted'} style={{ fontSize: 13 }}>
                {item.status === 'failed'
                  ? `Não aceita: ${item.lastError ?? ''}`
                  : 'Aguardando conexão para enviar'}
              </Label>
            </View>
            {item.status === 'failed' ? (
              <Touchable
                accessibilityRole="button"
                accessibilityLabel="Descartar registro não aceito"
                onPress={() => void offlineQueue.discard(item.id)}
              >
                <Label tone="primary" style={{ fontWeight: '700' }}>
                  Descartar
                </Label>
              </Touchable>
            ) : (
              <Chip tone="muted" icon="time" label="Na fila" />
            )}
          </Animated.View>
        ))}
        {queue.some((i) => i.status === 'failed') ? (
          <Label tone="muted" style={{ fontSize: 13 }}>
            Registro não aceito? Peça o ajuste no espelho de ponto pelo site ou fale com o RH.
          </Label>
        ) : null}
      </Card>

      <Button
        label="Visualizar espelho de ponto"
        variant="soft"
        icon="calendar-outline"
        onPress={() => router.push('/espelho')}
      />
    </Screen>
  );
}

/** Bolinha e traço da linha do tempo das marcações. */
function Timeline({ first, last, tone }: { first: boolean; last: boolean; tone: string }) {
  return (
    <View style={{ width: 14, alignSelf: 'stretch', alignItems: 'center' }}>
      <View style={{ flex: 1, width: 2, backgroundColor: first ? 'transparent' : `${tone}55` }} />
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: tone }} />
      <View style={{ flex: 1, width: 2, backgroundColor: last ? 'transparent' : `${tone}55` }} />
    </View>
  );
}
