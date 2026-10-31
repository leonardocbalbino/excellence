import { type ApiClient, pushDataSchema } from '@excellence/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const TOKEN_KEY = 'excellence.pushToken';

// Com o app aberto, a notificação também aparece (banner e som).
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
});

export type PushStatus = 'enabled' | 'denied' | 'unavailable';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Pede a permissão, cria o canal do Android e registra o token deste aparelho na API
 * (ADR 0022). Simulador e build sem projeto no EAS não recebem push.
 */
export async function registerForPush(api: ApiClient, ask = true): Promise<PushStatus> {
  if (!Device.isDevice || !projectId()) return 'unavailable';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Avisos do trabalho',
      description: 'Ronda, ponto, comunicados e respostas do RH.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#c9a356',
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await api.push.register({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return 'enabled';
}

/** Ao sair: o aparelho para de receber o push desta conta. */
export async function unregisterPush(api: ApiClient): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  await api.push.unregister(token).catch(() => undefined);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function pushStatus(): Promise<PushStatus> {
  if (!Device.isDevice || !projectId()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'enabled' : 'denied';
}

/** Tocar na notificação abre a tela dela (ronda, ponto, comunicados, espelho). */
export function usePushNavigation(ready: boolean) {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!ready || !response) return;
    const data = pushDataSchema.safeParse(response.notification.request.content.data);
    if (data.success && data.data.url.startsWith('/')) router.push(data.data.url as Href);
    void Notifications.clearLastNotificationResponseAsync();
  }, [ready, response]);
}
