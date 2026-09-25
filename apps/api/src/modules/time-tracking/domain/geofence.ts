import type { GeofenceStatus } from '@excellence/shared';

const EARTH_RADIUS_METERS = 6_371_008.8;

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface FenceUnit {
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number | null;
}

/**
 * Situação da posição em relação à cerca da unidade. A precisão informada pelo aparelho não
 * altera o resultado (fica registrada para quem analisar a marcação).
 */
export function evaluateGeofence(
  unit: FenceUnit,
  position: { latitude: number; longitude: number } | null,
): { status: GeofenceStatus; distanceMeters: number | null } {
  const hasFence =
    unit.latitude !== null && unit.longitude !== null && unit.geofenceRadiusMeters !== null;
  if (!position) return { status: hasFence ? 'no_location' : 'no_fence', distanceMeters: null };
  if (!hasFence || unit.latitude === null || unit.longitude === null) {
    return { status: 'no_fence', distanceMeters: null };
  }
  const distance = distanceMeters({ latitude: unit.latitude, longitude: unit.longitude }, position);
  return {
    status: distance <= (unit.geofenceRadiusMeters ?? 0) ? 'inside' : 'outside',
    distanceMeters: Math.round(distance * 10) / 10,
  };
}
