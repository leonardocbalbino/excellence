import type { EmployeeHistoryEvent, EmployeeHistoryKind } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import {
  BriefcaseIcon,
  CalendarRangeIcon,
  ClipboardCheckIcon,
  FileHeartIcon,
  GiftIcon,
  KeyRoundIcon,
  type LucideIcon,
  PencilIcon,
  UserPlusIcon,
  UserXIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/feedback';
import { errorMessage, useApi } from '@/lib/services';
import { cn } from '@/lib/utils';
import { employeesQueryKey } from './query-keys';

type Group = 'all' | 'record' | 'schedule' | 'benefit' | 'certificate' | 'adjustment';

const KIND: Record<EmployeeHistoryKind, { icon: LucideIcon; group: Exclude<Group, 'all'> }> = {
  hired: { icon: BriefcaseIcon, group: 'record' },
  terminated: { icon: UserXIcon, group: 'record' },
  record_created: { icon: UserPlusIcon, group: 'record' },
  record_updated: { icon: PencilIcon, group: 'record' },
  account_created: { icon: KeyRoundIcon, group: 'record' },
  schedule_assigned: { icon: CalendarRangeIcon, group: 'schedule' },
  schedule_unassigned: { icon: CalendarRangeIcon, group: 'schedule' },
  benefit_assigned: { icon: GiftIcon, group: 'benefit' },
  benefit_updated: { icon: GiftIcon, group: 'benefit' },
  benefit_removed: { icon: GiftIcon, group: 'benefit' },
  certificate_submitted: { icon: FileHeartIcon, group: 'certificate' },
  certificate_reviewed: { icon: FileHeartIcon, group: 'certificate' },
  adjustment_requested: { icon: ClipboardCheckIcon, group: 'adjustment' },
  adjustment_decided: { icon: ClipboardCheckIcon, group: 'adjustment' },
};

const GROUPS: { value: Group; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'record', label: 'Cadastro' },
  { value: 'schedule', label: 'Escala' },
  { value: 'benefit', label: 'Benefícios' },
  { value: 'certificate', label: 'Atestados' },
  { value: 'adjustment', label: 'Ajustes de ponto' },
];

function when(event: EmployeeHistoryEvent): string {
  const date = new Date(event.at);
  return event.dateOnly
    ? date.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Linha do tempo do funcionário, do mais recente ao mais antigo, com filtro por assunto. */
export function EmployeeHistory({ employeeId }: { employeeId: string }) {
  const api = useApi();
  const [group, setGroup] = useState<Group>('all');
  const history = useQuery({
    queryKey: [...employeesQueryKey, employeeId, 'history'],
    queryFn: () => api.employees.history(employeeId),
  });
  const events = (history.data ?? []).filter(
    (e) => group === 'all' || KIND[e.kind].group === group,
  );
  // Só oferece os filtros que têm eventos (cada assunto depende da permissão do perfil).
  const present = new Set((history.data ?? []).map((e) => KIND[e.kind].group));

  if (history.isPending) return <Skeleton className="h-64 w-full" />;
  if (history.isError) return <Alert variant="destructive">{errorMessage(history.error)}</Alert>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar o histórico">
        {GROUPS.filter((g) => g.value === 'all' || present.has(g.value)).map((g) => (
          <button
            key={g.value}
            type="button"
            aria-pressed={group === g.value}
            onClick={() => setGroup(g.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
              group === g.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:bg-accent',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada registrado neste assunto.</p>
      ) : (
        <ol className="relative space-y-5 border-l pl-6" aria-label="Histórico do funcionário">
          {events.map((event) => {
            const Icon = KIND[event.kind].icon;
            return (
              <li key={event.id} className="relative">
                <span
                  className="absolute -left-[2.3rem] grid size-7 place-items-center rounded-full border bg-card text-primary"
                  aria-hidden="true"
                >
                  <Icon className="size-3.5" />
                </span>
                <p className="text-xs text-muted-foreground">
                  <time dateTime={event.at}>{when(event)}</time>
                  {event.actor ? ` · por ${event.actor.name}` : ''}
                </p>
                <p className="font-semibold">{event.title}</p>
                {event.description ? (
                  <p className="text-sm text-muted-foreground">{event.description}</p>
                ) : null}
                {event.changes.length > 0 ? (
                  <dl className="mt-2 grid gap-1 rounded-lg bg-muted/50 p-3 text-sm">
                    {event.changes.map((change) => (
                      <div key={change.label} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                        <dt className="text-muted-foreground">{change.label}</dt>
                        <dd>
                          <span className="text-muted-foreground line-through">
                            {change.before ?? 'vazio'}
                          </span>{' '}
                          → <span className="font-medium">{change.after ?? 'vazio'}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
