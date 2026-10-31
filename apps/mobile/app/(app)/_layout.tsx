import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { registerForPush, unregisterPush, usePushNavigation } from '@/push';
import { accessQueryKey, conversationsUnreadKey, feedKey } from '@/query-keys';
import { errorMessage, useApi, useServices, useSession } from '@/services';
import { TabBar, type TabItem } from '@/tab-bar';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Label,
  Screen,
  styles,
  TextField,
  Title,
  useColors,
} from '@/ui';

/**
 * Área logada. Antes das abas, resolve o que a API exige: trocar a senha temporária e, para
 * perfis com MFA obrigatório ainda sem cadastro, orientar a fazer pelo site. O app é só do
 * funcionário: quem não tem cadastro de funcionário não passa daqui.
 */
export default function AppLayout() {
  const api = useApi();
  const state = useSession();
  const c = useColors();
  const authenticated = state.status === 'authenticated';
  const access = useQuery({
    queryKey: accessQueryKey,
    queryFn: () => api.access.mine(),
    enabled: authenticated,
  });
  const employee = access.data?.hasEmployeeRecord === true;
  const ready = employee && !access.data?.passwordChangeRequired && !access.data?.mfaSetupRequired;
  const feed = useQuery({
    queryKey: feedKey,
    queryFn: () => api.announcements.feed(),
    enabled: ready,
  });
  // Chamados com resposta do RH ainda não lida (selo em Mais).
  const unread = useQuery({
    queryKey: conversationsUnreadKey,
    queryFn: () => api.conversations.myUnread(),
    enabled: ready,
    refetchInterval: 60_000,
  });

  // Push: registra o aparelho uma vez por sessão, quando há conexão.
  const registered = useRef<string | null>(null);
  const online = authenticated && !state.offline;
  const userId = authenticated ? state.user.id : null;
  useEffect(() => {
    if (!ready || !online || !userId || registered.current === userId) return;
    registered.current = userId;
    void registerForPush(api).catch(() => undefined);
  }, [api, online, ready, userId]);
  usePushNavigation(ready);

  if (state.status === 'loading' || (authenticated && !access.data && access.isPending)) {
    return (
      <View style={[styles.flex, { justifyContent: 'center', backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  }
  if (state.status === 'anonymous') return <Redirect href="/login" />;
  if (access.isError && !access.data) return <AccessError message={errorMessage(access.error)} />;
  if (access.data?.passwordChangeRequired) return <ChangePassword />;
  if (access.data?.mfaSetupRequired) return <MfaOnWeb />;
  if (!employee) return <NotEmployee />;

  const items: TabItem[] = [
    { name: 'index', label: 'Início', icon: 'home-outline', activeIcon: 'home' },
    { name: 'ponto', label: 'Ponto', icon: 'finger-print-outline', activeIcon: 'finger-print' },
    ...(access.data?.hasPatrolRoutes
      ? [
          {
            name: 'rondas',
            label: 'Rondas',
            icon: 'qr-code-outline',
            activeIcon: 'qr-code',
          } as const,
        ]
      : []),
    { name: 'beneficios', label: 'Benefícios', icon: 'gift-outline', activeIcon: 'gift' },
    {
      name: 'mais',
      label: 'Mais',
      icon: 'grid-outline',
      activeIcon: 'grid',
      badge: (feed.data?.pending ?? 0) + (unread.data?.conversations ?? 0),
    },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'shift' }}
      tabBar={(props) => <TabBar {...props} items={items} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="ponto" />
      <Tabs.Screen
        name="rondas"
        options={{ href: access.data?.hasPatrolRoutes ? undefined : null }}
      />
      <Tabs.Screen name="beneficios" />
      <Tabs.Screen name="mais" />
      {/* Telas abertas a partir de outra (fora da barra de abas). */}
      <Tabs.Screen name="espelho" options={{ href: null }} />
      <Tabs.Screen name="comunicados" options={{ href: null }} />
      <Tabs.Screen name="perfil" options={{ href: null }} />
      <Tabs.Screen name="atendimento" options={{ href: null }} />
    </Tabs>
  );
}

function SignOutButton() {
  const { api, session } = useServices();
  const queryClient = useQueryClient();
  return (
    <Button
      label="Sair"
      variant="outline"
      icon="log-out-outline"
      onPress={() => {
        void (async () => {
          await unregisterPush(api);
          await session.signOut();
          queryClient.clear();
        })();
      }}
    />
  );
}

/** Regra do app: só quem tem cadastro de funcionário (a gestão continua no site). */
function NotEmployee() {
  return (
    <Screen>
      <Card>
        <EmptyState
          icon="id-card-outline"
          title="Este app é para funcionários"
          text="Seu usuário não está ligado a um cadastro de funcionário. A gestão (RH, gestores e administradores) é feita pelo site. Se você é funcionário, peça ao RH para vincular seu cadastro."
        />
        <SignOutButton />
      </Card>
    </Screen>
  );
}

function AccessError({ message }: { message: string }) {
  const queryClient = useQueryClient();
  return (
    <Screen>
      <Card>
        <EmptyState
          icon="cloud-offline-outline"
          title="Não foi possível abrir o app"
          text={message}
        />
        <Button
          label="Tentar de novo"
          icon="refresh"
          onPress={() => void queryClient.invalidateQueries({ queryKey: accessQueryKey })}
        />
        <SignOutButton />
      </Card>
    </Screen>
  );
}

function ChangePassword() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Screen title="Crie sua senha">
      <Card>
        <Label tone="muted">
          Você entrou com a senha temporária do RH. Crie uma senha sua para continuar.
        </Label>
        <TextField
          label="Senha temporária"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
        />
        <TextField
          label="Nova senha"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          textContentType="newPassword"
        />
        <TextField
          label="Repita a nova senha"
          value={repeat}
          onChangeText={setRepeat}
          secureTextEntry
        />
        <Button
          label="Salvar nova senha"
          icon="checkmark"
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
  return (
    <Screen>
      <Card>
        <Title>Verificação em duas etapas</Title>
        <Label>
          Seu perfil exige a verificação em duas etapas. Cadastre o aplicativo autenticador pelo
          site (menu da conta › Segurança da conta) e depois entre de novo no app.
        </Label>
        <SignOutButton />
      </Card>
    </Screen>
  );
}
