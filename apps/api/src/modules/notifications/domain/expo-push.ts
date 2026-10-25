import type { PushData } from '@excellence/shared';

/** Endpoint do serviço de push do Expo (entrega pelo FCM no Android e pelo APNs no iOS). */
export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** O Expo aceita até 100 mensagens por pedido. */
export const EXPO_BATCH_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data: PushData;
}

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: PushData;
  sound: 'default';
  priority: 'high';
  /** Canal criado pelo app no Android (som e importância). */
  channelId: 'default';
}

/** Um ticket por mensagem, na mesma ordem do envio. */
export type ExpoTicket =
  { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };

export function toExpoMessages(tokens: readonly string[], message: PushMessage): ExpoMessage[] {
  return tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  }));
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Tokens que o Expo diz não existirem mais (app desinstalado, permissão revogada): são
 * apagados para não insistir no envio.
 */
export function deadTokens(messages: readonly ExpoMessage[], tickets: readonly ExpoTicket[]) {
  return tickets.flatMap((ticket, index) =>
    ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
      ? [messages[index]?.to].filter((t): t is string => t !== undefined)
      : [],
  );
}
