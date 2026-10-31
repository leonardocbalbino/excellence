import {
  type PatrolCheckin,
  type PatrolRun,
  type PatrolSlotStatus,
  WEEKDAY_LABELS,
} from '@excellence/shared';

export const patrolPointsQueryKey = ['patrol-points'] as const;
export const patrolRoutesQueryKey = ['patrol-routes'] as const;
export const myPatrolsQueryKey = ['me', 'patrols'] as const;
export const patrolBoardQueryKey = ['patrol-board'] as const;
export const patrolRunQueryKey = ['patrol-run'] as const;

export const RUN_STATUS: Record<PatrolRun['status'], string> = {
  in_progress: 'Em andamento',
  completed: 'Concluída',
  incomplete: 'Incompleta',
};

export const SLOT_STATUS: Record<PatrolSlotStatus, string> = {
  upcoming: 'Prevista',
  in_progress: 'Em andamento',
  done: 'Feita',
  missed: 'Não iniciada',
};

/** "Atrasada 12 min", "Concluída", "Em andamento"… */
export function runStatusText(run: PatrolRun): string {
  if (run.status === 'in_progress' && run.lateMinutes > 0) {
    return `Atrasada ${String(run.lateMinutes)} min`;
  }
  return RUN_STATUS[run.status];
}

/** Hora local (HH:MM) de um instante no fuso informado. */
export function localTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Onde o check-in foi feito, em relação à localização cadastrada do ponto. */
export const CHECKIN_LOCATION: Record<PatrolCheckin['geofenceStatus'], string> = {
  inside: 'No local do ponto',
  outside: 'Longe do ponto',
  no_location: 'Sem localização do aparelho',
  no_fence: 'Ponto sem localização cadastrada',
};

/** [1, 2, 3] → "Seg, Ter, Qua"; todos → "Todos os dias". */
export function weekdaysText(weekdays: readonly number[]): string {
  if (weekdays.length === 7) return 'Todos os dias';
  if (weekdays.length === 0) return '—';
  return weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ');
}
