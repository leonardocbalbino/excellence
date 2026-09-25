/** Posição obtida do dispositivo. O horário oficial das marcações é sempre o do servidor. */
export interface DevicePosition {
  latitude: number;
  longitude: number;
  /** Raio de incerteza informado pelo dispositivo, em metros. */
  accuracyMeters: number;
  /** Horário do dispositivo, guardado só para auditoria (regra 4). */
  deviceTimestamp: string;
}

export type GeolocationFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export class GeolocationError extends Error {
  constructor(readonly reason: GeolocationFailure) {
    super(GEOLOCATION_MESSAGES[reason]);
    this.name = 'GeolocationError';
  }
}

export const GEOLOCATION_MESSAGES: Record<GeolocationFailure, string> = {
  unsupported: 'Este dispositivo não informa a localização.',
  denied: 'A localização foi bloqueada. Libere o acesso nas configurações do navegador.',
  unavailable: 'Não foi possível obter a localização. Verifique se o GPS está ligado.',
  timeout: 'A localização demorou demais para responder. Tente de novo em local aberto.',
};

/**
 * Posição atual com alta precisão, sem usar posição em cache. Usada na marcação de ponto
 * e no check-in de ronda.
 */
export function getCurrentPosition(
  options: { timeoutMs?: number; geolocation?: Geolocation | undefined } = {},
): Promise<DevicePosition> {
  const geolocation =
    options.geolocation ?? (typeof navigator === 'undefined' ? undefined : navigator.geolocation);
  if (!geolocation) return Promise.reject(new GeolocationError('unsupported'));

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          deviceTimestamp: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        const reason: GeolocationFailure =
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable';
        reject(new GeolocationError(reason));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: options.timeoutMs ?? 15_000 },
    );
  });
}
