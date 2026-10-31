import type { GeofenceStatus } from '@excellence/shared';

/**
 * Até quanto da imprecisão informada pelo GPS do aparelho entra a favor do funcionário. Acima
 * disso, um GPS ruim não libera um check-in longe do ponto.
 */
export const MAX_ACCURACY_ALLOWANCE_METERS = 30;

export type ProximityCheck =
  | { ok: true }
  | { ok: false; reason: 'no_location' }
  | { ok: false; reason: 'too_far'; distanceMeters: number; radiusMeters: number };

/**
 * O check-in só vale perto do QR code (ADR 0024). Vale quando o ponto tem localização e raio
 * cadastrados; sem isso, a leitura é aceita como antes (só registrada).
 * - sem a posição do aparelho: recusa (o ponto exige estar no local);
 * - fora do raio: recusa, descontando a imprecisão do GPS até o limite acima.
 */
export function checkProximity(
  fence: { status: GeofenceStatus; distanceMeters: number | null },
  radiusMeters: number | null,
  accuracyMeters: number | null | undefined,
): ProximityCheck {
  if (fence.status === 'no_fence' || fence.status === 'inside' || radiusMeters === null) {
    return { ok: true };
  }
  if (fence.status === 'no_location' || fence.distanceMeters === null) {
    return { ok: false, reason: 'no_location' };
  }
  const allowance = Math.min(Math.max(accuracyMeters ?? 0, 0), MAX_ACCURACY_ALLOWANCE_METERS);
  if (fence.distanceMeters - allowance <= radiusMeters) return { ok: true };
  return {
    ok: false,
    reason: 'too_far',
    distanceMeters: Math.round(fence.distanceMeters),
    radiusMeters,
  };
}

/** Pontos que a ronda precisa ler: o mínimo da rota, sem passar do total. */
export function requiredPoints(minPoints: number | null, total: number): number {
  return minPoints === null ? total : Math.min(minPoints, total);
}
