import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, Tabs } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { accessQueryKey } from '@/query-keys';
import { errorMessage, useApi, useServices, useSession } from '@/services';
import { Banner, Button, Card, Label, Screen, styles, Title, useColors } from '@/ui';

/**
 * Área logada. Antes das abas, resolve o que a API exige: trocar a senha temporária e, para
 * perfis com MFA obrigatório ainda sem cadastro, orientar a fazer pelo site.
 */
export default function AppLayout() {
  const api = useApi();
  const state = useSession();
  const c = useColors();
  const access = useQuery({
    queryKey: accessQueryKey,
    queryFn: () => api.access.mine(),
    enabled: state.status === 'authenticated',
  });

  if (state.status === 'loading') {
    return (
      <View style={[styles.flex, { justifyContent: 'center', backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (state.status === 'anonymous') return <Redirect href="/login" />;
  if (access.data?.passwordChangeRequired) return <ChangePassword />;
  if (access.data?.mfaSetupRequired) return <MfaOnWeb />;

  const personal = access.data?.hasEmployeeRecord ?? true;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="ponto"
        options={{
          title: 'Ponto',
          href: personal ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="rondas"
        options={{
          title: 'Rondas',
          href: access.data?.hasPatrolRoutes ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="mais"
        options={{
          title: 'Mais',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" color={color} size={size} />
          ),
        }}
      />
      {/* Telas abertas a partir de "Mais" (fora da barra de abas). */}
      <Tabs.Screen name="espelho" options={{ href: null }} />
      <Tabs.Screen name="comunicados" options={{ href: null }} />
      <Tabs.Screen name="beneficios" options={{ href: null }} />
      <Tabs.Screen name="perfil" options={{ href: null }} />
    </Tabs>
  );
}

function ChangePassword() {
  const api = useApi();
  const queryClient = useQueryClient();
  const c = useColors();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = [
    styles.label,
    {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      color: c.foreground,
      borderRadius: 12,
      paddingHorizontal: 14,
      minHeight: 48,
    },
  ];

  const save = async () => {
    if (next !== repeat) {
      setError('As senhas novas não conferem.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.changePassword({ currentPassword: current, newPassword: next });
      await queryClient.invalidateQueries({ queryKey: accessQueryKey });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Title>Crie sua senha</Title>
        <Label tone="muted">
          Você entrou com a senha temporária do RH. Crie uma senha sua para continuar.
        </Label>
        <Label>Senha temporária</Label>
        <TextInput
          style={input}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          accessibilityLabel="Senha temporária"
        />
        <Label>Nova senha</Label>
        <TextInput
          style={input}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          textContentType="newPassword"
          accessibilityLabel="Nova senha"
        />
        <Label>Repita a nova senha</Label>
        <TextInput
          style={input}
          value={repeat}
          onChangeText={setRepeat}
          secureTextEntry
          accessibilityLabel="Repita a nova senha"
        />
        <Button
          label="Salvar nova senha"
          onPress={() => void save()}
          loading={busy}
          disabled={!current || !next || !repeat}
        />
        {error ? <Banner tone="warning">{error}</Banner> : null}
      </Card>
    </Screen>
  );
}

function MfaOnWeb() {
  const { session } = useServices();
  return (
    <Screen>
      <Card>
        <Title>Verificação em duas etapas</Title>
        <Label>
          Seu perfil exige a verificação em duas etapas. Cadastre o aplicativo autenticador pelo
          site (menu da conta › Segurança da conta) e depois entre de novo no app.
        </Label>
        <Button label="Sair" variant="outline" onPress={() => void session.signOut()} />
      </Card>
    </Screen>
  );
}
