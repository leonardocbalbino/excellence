import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppState, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { biometricEnabled, confirmIdentity } from '@/device';
import { offlineQueue } from '@/offline-queue';
import { accessQueryKey, clockSettingsKey, myPatrolsKey } from '@/query-keys';
import { createServices, ServicesProvider, useServices, useSession } from '@/services';
import { Button, styles, Title, useColors, usePulse } from '@/ui';

const services = createServices();
const DAY = 24 * 60 * 60_000;
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, gcTime: DAY } },
});

/**
 * Só o necessário para trabalhar sem conexão fica gravado no aparelho: permissões, rotas e
 * ronda em andamento, configuração do ponto. Dados pessoais (perfil, espelho, benefícios)
 * não são gravados.
 */
const OFFLINE_KEYS = [accessQueryKey, myPatrolsKey, clockSettingsKey].map((key) =>
  JSON.stringify(key),
);
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'excellence.queryCache.v1',
});

/** Depois deste tempo em segundo plano, a biometria é pedida de novo. */
const LOCK_AFTER_MS = 5 * 60_000;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ServicesProvider services={services}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: DAY,
            dehydrateOptions: {
              shouldDehydrateQuery: (query) =>
                query.state.status === 'success' &&
                OFFLINE_KEYS.includes(JSON.stringify(query.queryKey)),
            },
          }}
        >
          <StatusBar style="auto" />
          <AppGate />
        </PersistQueryClientProvider>
      </ServicesProvider>
    </SafeAreaProvider>
  );
}

type Lock = 'checking' | 'locked' | 'open';

/**
 * Abre a sessão guardada (com biometria, se ativada), trava de novo depois de um tempo em
 * segundo plano e envia a fila offline quando a conexão volta.
 */
function AppGate() {
  const { api, session } = useServices();
  const state = useSession();
  const [lock, setLock] = useState<Lock>('checking');
  const backgroundAt = useRef<number | null>(null);
  const flush = () => {
    const current = session.getState();
    if (current.status === 'authenticated') void offlineQueue.flush(api, current.user.id);
  };

  const unlock = async () => {
    if (await confirmIdentity('Destravar o Excellence')) {
      setLock('open');
      await session.restore();
    } else {
      setLock('locked');
    }
  };

  // Abertura do app.
  useEffect(() => {
    void (async () => {
      await offlineQueue.load();
      if ((await session.hasStoredSession()) && (await biometricEnabled())) {
        await unlock();
      } else {
        setLock('open');
        await session.restore();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura
  }, []);

  // Segundo plano: trava depois de LOCK_AFTER_MS; ao voltar, tenta enviar a fila.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') backgroundAt.current = Date.now();
      if (next !== 'active') return;
      const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
      backgroundAt.current = null;
      void (async () => {
        if (away > LOCK_AFTER_MS && session.accessToken() && (await biometricEnabled())) {
          setLock('locked');
          await unlock();
        }
        flush();
      })();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assinatura única
  }, []);

  // Conexão de volta e, por garantia, a cada minuto.
  useEffect(() => {
    if (state.status !== 'authenticated') return;
    flush();
    const listener = Network.addNetworkStateListener((network) => {
      if (network.isConnected) flush();
    });
    const timer = setInterval(flush, 60_000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, [api, state.status]);

  if (lock !== 'open') {
    return (
      <LockScreen
        checking={lock === 'checking'}
        onUnlock={unlock}
        onUsePassword={() => {
          // Esquece a sessão guardada e mostra o login.
          void session.clear().then(() => setLock('open'));
        }}
      />
    );
  }
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}

function LockScreen({
  checking,
  onUnlock,
  onUsePassword,
}: {
  checking: boolean;
  onUnlock: () => Promise<void>;
  onUsePassword: () => void;
}) {
  const c = useColors();
  const pulse = usePulse(!checking);
  return (
    <LinearGradient
      colors={c.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.flex, styles.padded, styles.gap, { justifyContent: 'center' }]}
    >
      <View style={{ alignItems: 'center', gap: 18, marginBottom: 24 }}>
        <View style={{ alignItems: 'center', justifyContent: 'center', width: 140, height: 140 }}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: '#ffffff',
              },
              pulse,
            ]}
          />
          <Animated.View
            entering={ZoomIn.springify().damping(12)}
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: '#ffffff26',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="finger-print" size={64} color="#ffffff" />
          </Animated.View>
        </View>
        <Title style={{ color: '#ffffff', fontSize: 30 }}>Excellence</Title>
        <Text style={{ color: '#ffffffcc', fontSize: 16, textAlign: 'center' }}>
          {checking ? 'Abrindo…' : 'Use a digital ou o rosto para destravar.'}
        </Text>
      </View>
      {checking ? null : (
        <>
          <Button
            label="Destravar"
            variant="inverse"
            icon="lock-open"
            onPress={() => void onUnlock()}
          />
          <Button
            label="Entrar com e-mail e senha"
            variant="inverseGhost"
            onPress={onUsePassword}
          />
        </>
      )}
    </LinearGradient>
  );
}
