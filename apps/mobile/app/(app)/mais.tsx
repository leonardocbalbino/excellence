import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import {
  biometricAvailable,
  biometricEnabled,
  confirmIdentity,
  setBiometricEnabled,
} from '@/device';
import { type PushStatus, pushStatus, registerForPush, unregisterPush } from '@/push';
import { Avatar } from '@/avatar';
import { conversationsUnreadKey, feedKey } from '@/query-keys';
import { useApi, useServices, useSession } from '@/services';
import {
  Button,
  Card,
  Chip,
  Hero,
  IconCircle,
  type IconName,
  Label,
  Screen,
  styles,
  Touchable,
  useColors,
} from '@/ui';

function Item({
  label,
  icon,
  to,
  badge,
  last = false,
}: {
  label: string;
  icon: IconName;
  to: Href;
  badge?: string;
  last?: boolean;
}) {
  const c = useColors();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(to)}
      style={[
        styles.row,
        {
          paddingVertical: 12,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: c.border,
        },
      ]}
    >
      <View style={[styles.row, { justifyContent: 'flex-start', gap: 12 }]}>
        <IconCircle name={icon} size={38} />
        <Label style={{ fontWeight: '600' }}>{label}</Label>
      </View>
      <View style={[styles.row, { gap: 6 }]}>
        {badge ? <Chip tone="warning" label={badge} /> : null}
        <Ionicons name="chevron-forward" size={18} color={c.mutedForeground} />
      </View>
    </Touchable>
  );
}

/** Mais: espelho, comunicados, perfil, notificações, biometria e sair. */
export default function MoreScreen() {
  const api = useApi();
  const c = useColors();
  const { session } = useServices();
  const queryClient = useQueryClient();
  const state = useSession();
  const feed = useQuery({ queryKey: feedKey, queryFn: () => api.announcements.feed() });
  const unread = useQuery({
    queryKey: conversationsUnreadKey,
    queryFn: () => api.conversations.myUnread(),
  });
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [push, setPush] = useState<PushStatus | null>(null);

  useEffect(() => {
    void (async () => {
      setBioAvailable(await biometricAvailable());
      setBioOn(await biometricEnabled());
      setPush(await pushStatus());
    })();
  }, []);

  const toggleBiometric = async (value: boolean) => {
    // Ligar pede a biometria uma vez, para confirmar que funciona neste aparelho.
    if (value && !(await confirmIdentity('Ativar o destravamento por biometria'))) return;
    await setBiometricEnabled(value);
    setBioOn(value);
  };

  const enablePush = async () => {
    const status = await registerForPush(api).catch(() => 'unavailable' as const);
    // Recusado antes: o sistema não pergunta de novo, só nas configurações.
    if (status === 'denied') void Linking.openSettings();
    setPush(status);
  };

  const user = state.status === 'authenticated' ? state.user : null;

  return (
    <Screen title="Mais">
      {user ? (
        <Hero style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={user.name} size={64} editable inverse />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800' }} numberOfLines={1}>
              {user.name}
            </Text>
            <Text style={{ color: '#ffffffcc' }} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
        </Hero>
      ) : null}

      <Card index={1}>
        <Item
          label="Falar com o RH"
          icon="chatbubbles-outline"
          to="/atendimento"
          {...(unread.data && unread.data.conversations > 0
            ? { badge: `${String(unread.data.conversations)} com resposta` }
            : {})}
        />
        <Item label="Espelho de ponto" icon="calendar-outline" to="/espelho" />
        <Item
          label="Comunicados"
          icon="megaphone-outline"
          to="/comunicados"
          {...(feed.data && feed.data.pending > 0
            ? { badge: `${String(feed.data.pending)} novos` }
            : {})}
        />
        <Item label="Meu perfil" icon="person-outline" to="/perfil" last />
      </Card>

      <Card index={2}>
        <View style={styles.row}>
          <View style={[styles.row, { flex: 1, justifyContent: 'flex-start', gap: 12 }]}>
            <IconCircle name="notifications-outline" size={38} />
            <View style={{ flex: 1 }}>
              <Label style={{ fontWeight: '600' }}>Notificações</Label>
              <Label tone="muted" style={{ fontSize: 13 }}>
                {push === 'enabled'
                  ? 'Ativas: ronda, ponto, comunicados e respostas do RH.'
                  : push === 'unavailable'
                    ? 'Indisponíveis neste aparelho.'
                    : 'Desativadas. Ative para receber os lembretes.'}
              </Label>
            </View>
          </View>
          {push === 'enabled' ? (
            <Chip tone="success" icon="checkmark" label="Ativas" />
          ) : push === 'denied' ? (
            <Touchable accessibilityRole="button" onPress={() => void enablePush()}>
              <Label tone="primary" style={{ fontWeight: '700' }}>
                Ativar
              </Label>
            </Touchable>
          ) : null}
        </View>
        {bioAvailable ? (
          <View
            style={[styles.row, { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }]}
          >
            <View style={[styles.row, { flex: 1, justifyContent: 'flex-start', gap: 12 }]}>
              <IconCircle name="finger-print" size={38} />
              <View style={{ flex: 1 }}>
                <Label style={{ fontWeight: '600' }}>Destravar com biometria</Label>
                <Label tone="muted" style={{ fontSize: 13 }}>
                  Ao abrir o app e depois de 5 min fora dele.
                </Label>
              </View>
            </View>
            <Switch
              value={bioOn}
              onValueChange={(value) => void toggleBiometric(value)}
              trackColor={{ true: c.primary }}
              accessibilityLabel="Destravar com biometria"
            />
          </View>
        ) : null}
      </Card>

      <Button
        label="Sair"
        variant="outline"
        icon="log-out-outline"
        onPress={() => {
          void (async () => {
            // Os registros sem conexão ficam guardados e saem quando a mesma pessoa entrar de novo.
            await unregisterPush(api);
            await session.signOut();
            queryClient.clear();
          })();
        }}
      />
      <Label tone="muted" style={{ textAlign: 'center', fontSize: 12 }}>
        Excellence {Constants.expoConfig?.version ?? ''}
      </Label>
    </Screen>
  );
}
