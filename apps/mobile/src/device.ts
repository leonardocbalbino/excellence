import { type ApiClient, ApiUnavailableError } from '@excellence/shared';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

export function newKey(): string {
  return Crypto.randomUUID();
}

// ─── Localização ──────────────────────────────────────────────────────────────────

export interface DevicePosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
}

/**
 * Posição atual, ou null (sem permissão, GPS desligado, demorou demais). O ponto e a ronda
 * seguem sem ela quando a empresa não exige; o servidor registra "sem localização".
 */
export async function currentPosition(timeoutMs = 10_000): Promise<DevicePosition | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const position = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    .then((p) => ({
      latitude: p.coords.latitude,
      longitude: p.coords.longitude,
      accuracyMeters: p.coords.accuracy ?? null,
    }))
    .catch(() => null);
  return Promise.race([position, timeout]);
}

// ─── Biometria ────────────────────────────────────────────────────────────────────

const BIOMETRIC_KEY = 'excellence.biometricLock';

export async function biometricAvailable(): Promise<boolean> {
  return (
    (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
  );
}

export async function biometricEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === 'on';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(BIOMETRIC_KEY, 'on');
  else await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
}

/** Pede digital/rosto (ou o PIN do aparelho, se a biometria falhar). */
export async function confirmIdentity(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
  });
  return result.success;
}

// ─── Foto (selfie do ponto) ───────────────────────────────────────────────────────

/**
 * Envia uma foto do aparelho direto ao storage (política pré-assinada) e confirma na API,
 * como o web faz. Devolve o id do arquivo para a marcação.
 */
export async function uploadPhoto(api: ApiClient, uri: string): Promise<string> {
  let size: number;
  try {
    size = (await (await fetch(uri)).blob()).size;
  } catch (error) {
    throw new ApiUnavailableError('Não foi possível ler a foto.', { cause: error });
  }
  const ticket = await api.files.createUpload({
    purpose: 'selfie',
    fileName: 'selfie.jpg',
    contentType: 'image/jpeg',
    sizeBytes: size,
  });
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
  // No React Native o arquivo vai como { uri, name, type }.
  form.append('file', { uri, name: 'selfie.jpg', type: 'image/jpeg' } as unknown as Blob);
  let response: Response;
  try {
    response = await fetch(ticket.url, { method: 'POST', body: form });
  } catch (error) {
    throw new ApiUnavailableError('Não foi possível enviar a foto.', { cause: error });
  }
  if (!response.ok) throw new ApiUnavailableError('O armazenamento recusou a foto.');
  await api.files.confirm(ticket.fileId);
  return ticket.fileId;
}
