import type { TimeEntry } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { currentPosition, newKey, uploadPhoto } from './device';
import { offlineQueue } from './offline-queue';
import { clockSettingsKey, todayEntriesKey } from './query-keys';
import { isRetryable, useApi, useSession } from './services';

export type ClockResult = { status: 'sent'; entry: TimeEntry } | { status: 'queued'; at: string };

/**
 * Registro de ponto no app. Com conexão, o horário oficial é o do servidor. Sem conexão, a
 * marcação vai para a fila com o horário do aparelho (ADR 0019) e é enviada depois.
 *
 * Se a primeira tentativa cair no meio (a resposta se perde), a fila usa outra chave de
 * idempotência: no pior caso o servidor recebe duas marcações, e o gestor desconsidera uma
 * por ajuste. Reaproveitar a chave não serve, porque o corpo muda (vai o horário do aparelho).
 */
export function useClock() {
  const api = useApi();
  const queryClient = useQueryClient();
  const session = useSession();
  const settings = useQuery({ queryKey: clockSettingsKey, queryFn: () => api.time.settings() });

  const register = async (photoUri: string | null): Promise<ClockResult> => {
    const at = new Date().toISOString();
    const position = await currentPosition();
    if (settings.data?.requireLocation && !position) {
      throw new Error('A empresa exige a localização. Ative o GPS e permita o acesso.');
    }
    const input = {
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      accuracyMeters: position?.accuracyMeters ?? null,
      deviceTimestamp: at,
    };
    try {
      const selfieFileId = photoUri ? await uploadPhoto(api, photoUri) : null;
      const entry = await api.time.clock({ ...input, selfieFileId }, newKey());
      await queryClient.invalidateQueries({ queryKey: todayEntriesKey });
      return { status: 'sent', entry };
    } catch (error) {
      if (!isRetryable(error) || session.status !== 'authenticated') throw error;
      await offlineQueue.enqueue({
        id: newKey(),
        userId: session.user.id,
        kind: 'clock',
        createdAt: at,
        status: 'pending',
        lastError: null,
        input: { ...input, offlineRecordedAt: at },
        photoUri,
      });
      return { status: 'queued', at };
    }
  };

  return { settings, register };
}
