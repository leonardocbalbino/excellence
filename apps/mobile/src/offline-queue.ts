import type { ApiClient, ClockInput, PatrolCheckinInput } from '@excellence/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { uploadPhoto } from './device';
import { errorMessage, isRetryable } from './services';

const STORAGE_KEY = 'excellence.offlineQueue.v1';

interface Base {
  /** Também é a chave de idempotência: reenviar não duplica o registro. */
  id: string;
  /** Dono do registro: só é enviado com a sessão dessa pessoa (aparelho compartilhado). */
  userId: string;
  createdAt: string;
  status: 'pending' | 'failed';
  lastError: string | null;
}

export type QueueItem =
  | (Base & {
      kind: 'clock';
      input: ClockInput;
      /** Foto tirada sem conexão: enviada antes da marcação. */
      photoUri: string | null;
    })
  | (Base & {
      kind: 'checkin';
      runId: string;
      routeName: string;
      input: PatrolCheckinInput;
    });

/**
 * Fila de registros feitos sem conexão (ADR 0019). Fica gravada no aparelho e é enviada em
 * ordem quando a conexão volta. Cada item leva o horário em que foi feito
 * (`offlineRecordedAt`); o servidor aceita dentro da janela e sinaliza como offline.
 * - Falha de rede ou servidor fora do ar: para e tenta de novo depois.
 * - Recusa do servidor (ex.: mais de 72 h, ponto fora da ronda): o item fica como "falhou"
 *   para o usuário ver e descartar; não é reenviado sozinho.
 */
class OfflineQueue {
  private items: QueueItem[] = [];
  private loaded = false;
  private flushing: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getItems = (): QueueItem[] => this.items;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.items = raw ? (JSON.parse(raw) as QueueItem[]) : [];
    } catch {
      this.items = [];
    }
    this.loaded = true;
    this.notify();
  }

  async enqueue(item: QueueItem): Promise<void> {
    await this.load();
    await this.save([...this.items, item]);
  }

  async discard(id: string): Promise<void> {
    await this.save(this.items.filter((item) => item.id !== id));
  }

  /**
   * Envia em ordem os pendentes do usuário logado. Chamadas simultâneas compartilham o mesmo
   * envio.
   */
  flush(api: ApiClient, userId: string): Promise<void> {
    this.flushing ??= this.run(api, userId).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async run(api: ApiClient, userId: string): Promise<void> {
    await this.load();
    for (const item of [...this.items]) {
      if (item.status !== 'pending' || item.userId !== userId) continue;
      try {
        if (item.kind === 'clock') {
          let input = item.input;
          if (item.photoUri && !input.selfieFileId) {
            input = { ...input, selfieFileId: await uploadPhoto(api, item.photoUri) };
            // Guarda o id da foto: se a marcação falhar, não envia a foto de novo.
            await this.replace({ ...item, input });
          }
          await api.time.clock(input, item.id);
        } else {
          await api.patrols.checkin(item.runId, item.input, item.id);
        }
        await this.save(this.items.filter((i) => i.id !== item.id));
      } catch (error) {
        if (isRetryable(error)) return;
        await this.replace({ ...item, status: 'failed', lastError: errorMessage(error) });
      }
    }
  }

  private async replace(item: QueueItem): Promise<void> {
    await this.save(this.items.map((i) => (i.id === item.id ? item : i)));
  }

  private async save(items: QueueItem[]): Promise<void> {
    this.items = items;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

export const offlineQueue = new OfflineQueue();

/** Registros do usuário informado (os de outras pessoas no mesmo aparelho ficam de fora). */
export function useOfflineQueue(userId: string | null): QueueItem[] {
  const items = useSyncExternalStore(offlineQueue.subscribe, offlineQueue.getItems);
  return userId ? items.filter((item) => item.userId === userId) : [];
}
