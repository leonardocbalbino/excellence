import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import {
  biometricAvailable,
  biometricEnabled,
  confirmIdentity,
  setBiometricEnabled,
} from '@/device';
import { feedKey } from '@/query-keys';
import { useApi, useServices, useSession } from '@/services';
import { Button, Card, Label, Screen, styles, Title, useColors } from '@/ui';

function Item({ label, detail, to }: { label: string; detail?: string; to: Href }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(to)}
      style={({ pressed }) => [
        styles.row,
        {
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Label style={{ fontWeight: '600' }}>{label}</Label>
      <Label tone={detail ? 'warning' : 'muted'}>{detail ?? '›'}</Label>
    </Pressable>
  );
}

/** Mais: espelho, comunicados, benefícios, perfil, biometria e sair. */
export default function MoreScreen() {
  const api = useApi();
  const { session } = useServices();
  const queryClient = useQueryClient();
  const state = useSession();
  const feed = useQuery({ queryKey: feedKey, queryFn: () => api.announcements.feed() });
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);

  useEffect(() => {
    void (async () => {
      setBioAvailable(await biometricAvailable());
      setBioOn(await biometricEnabled());
    })();
  }, []);

  const toggleBiometric = async (value: boolean) => {
    // Ligar pede a biometria uma vez, para confirmar que funciona neste aparelho.
    if (value && !(await confirmIdentity('Ativar o destravamento por biometria'))) return;
    await setBiometricEnabled(value);
    setBioOn(value);
  };

  return (
    <Screen>
      <Title>Mais</Title>
      {state.status === 'authenticated' ? (
        <Card>
          <Label style={{ fontWeight: '700' }}>{state.user.name}</Label>
          <Label tone="muted">{state.user.email}</Label>
        </Card>
      ) : null}
      <Card>
        <Item label="Espelho de ponto" to="/espelho" />
        <Item
          label="Comunicados"
          to="/comunicados"
          {...(feed.data && feed.data.pending > 0
            ? { detail: `${String(feed.data.pending)} novos` }
            : {})}
        />
        <Item label="Benefícios e links" to="/beneficios" />
        <Item label="Meu perfil" to="/perfil" />
      </Card>
      {bioAvailable ? (
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Label style={{ fontWeight: '600' }}>Destravar com biometria</Label>
              <Label tone="muted" style={{ fontSize: 13 }}>
                Pede a digital ou o rosto ao abrir o app e depois de 5 min fora dele.
              </Label>
            </View>
            <Switch
              value={bioOn}
              onValueChange={(value) => void toggleBiometric(value)}
              accessibilityLabel="Destravar com biometria"
            />
          </View>
        </Card>
      ) : null}
      <Button
        label="Sair"
        variant="outline"
        onPress={() => {
          // Os registros sem conexão ficam guardados e saem quando a mesma pessoa entrar de novo.
          void session.signOut().then(() => queryClient.clear());
        }}
      />
    </Screen>
  );
}
