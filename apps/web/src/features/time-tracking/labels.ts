import type { Adjustment, TimeEntry } from '@excellence/shared';

export const GEOFENCE_LABELS: Record<TimeEntry['geofenceStatus'], string> = {
  inside: 'Dentro da área do posto',
  outside: 'Fora da área do posto',
  no_location: 'Sem localização',
  no_fence: 'Posto sem cerca virtual',
};

export const ADJUSTMENT_STATUS: Record<Adjustment['status'], string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};

/** Mês corrente (AAAA-MM) e navegação entre meses. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year = 0, m = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [year = 0, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
