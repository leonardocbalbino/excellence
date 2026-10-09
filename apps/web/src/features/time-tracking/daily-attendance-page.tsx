import type { AttendanceStatus } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { MapPinOffIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { formatDate, formatMinutes, todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { cn } from '@/lib/utils';
import {
  ATTENDANCE_LABELS,
  type AttendanceItem,
  dailyAttendanceQueryKey,
  isOverdue,
  summarize,
} from './attendance';

type Filter = AttendanceStatus | 'overdue' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'present', label: 'Em jornada' },
  { value: 'overdue', label: 'Sem registro' },
  { value: 'finished', label: 'Encerraram' },
  { value: 'justified', label: 'Atestado' },
  { value: 'off', label: 'Folga' },
];

function statusBadge(item: AttendanceItem, isToday: boolean) {
  if (isOverdue(item, isToday)) return <Badge variant="warning">Sem registro</Badge>;
  if (item.status === 'no_entries') return <Badge variant="outline">Aguardando turno</Badge>;
  const variant =
    item.status === 'present' ? 'soft' : item.status === 'off' ? 'outline' : 'secondary';
  return <Badge variant={variant}>{ATTENDANCE_LABELS[item.status]}</Badge>;
}

function plannedText(item: AttendanceItem): string {
  const { planned } = item;
  if (planned.holiday) return `Feriado: ${planned.holiday.name}`;
  if (planned.shift) return `${planned.shift.start}–${planned.shift.end}`;
  if (planned.unassigned) return 'Sem escala';
  if (planned.flexibleWeeklyMinutes !== null) return 'Flexível';
  return 'Folga';
}

function Entries({ item }: { item: AttendanceItem }) {
  if (item.entries.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {item.entries.map((entry) => (
        <span
          key={entry.id}
          className={cn(
            'inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs',
            entry.geofenceStatus === 'outside' && 'bg-warning-soft text-warning',
          )}
          title={entry.geofenceStatus === 'outside' ? 'Fora da área do posto' : undefined}
        >
          {entry.geofenceStatus === 'outside' ? (
            <MapPinOffIcon className="size-3" aria-label="Fora da área do posto" />
          ) : null}
          {entry.localTime}
          {entry.nextDay ? <span className="text-muted-foreground">+1</span> : null}
          {entry.kind === 'inclusion' ? (
            <span className="text-muted-foreground">(ajuste)</span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/**
 * Ponto do dia (gestão): quem marcou, quem está em jornada e quem ainda não registrou, para
 * os funcionários no escopo do perfil. O próprio ponto de quem consulta não aparece aqui.
 */
export function DailyAttendancePage() {
  const api = useApi();
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [unitId, setUnitId] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const isToday = date === today;
  const canAssign = useCan('schedules:assign');

  const attendance = useQuery({
    queryKey: [...dailyAttendanceQueryKey, date],
    queryFn: () => api.time.daily({ date }),
    refetchInterval: isToday ? 60_000 : false,
  });
  const all = attendance.data?.items ?? [];
  const units = [...new Map(all.map((i) => [i.employee.unit.id, i.employee.unit])).values()].sort(
    (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
  );
  const inUnit = unitId === 'all' ? all : all.filter((i) => i.employee.unit.id === unitId);
  const summary = summarize(inUnit, isToday);
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const shown = inUnit.filter((item) => {
    if (filter === 'overdue' && !isOverdue(item, isToday)) return false;
    if (filter !== 'overdue' && filter !== 'all' && item.status !== filter) return false;
    if (!term) return true;
    return (
      item.employee.name.toLocaleLowerCase('pt-BR').includes(term) ||
      item.employee.registrationNumber.includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{formatDate(date)}</p>
          <h1 className="text-3xl font-bold">Ponto do dia</h1>
          <p className="text-muted-foreground">
            Marcações e escala dos funcionários no seu escopo. O seu próprio ponto fica em “Meu
            espaço”.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="attendance-date">Data</Label>
            <Input
              id="attendance-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value || today)}
              className="w-44"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="attendance-unit">Posto</Label>
            <Select
              id="attendance-unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-48"
            >
              <option value="all">Todas</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard
          label={isToday ? 'Em jornada agora' : 'Marcações incompletas'}
          value={summary.present}
          suffix={`/ ${String(summary.expected)}`}
          tone="primary"
          loading={attendance.isPending}
        />
        <StatCard label="Encerraram" value={summary.finished} loading={attendance.isPending} />
        <StatCard
          label="Sem registro"
          value={summary.overdue}
          note={isToday ? 'Turno já começou' : 'Tinham turno e não marcaram'}
          tone={summary.overdue > 0 ? 'warning' : 'muted'}
          loading={attendance.isPending}
        />
        <StatCard label="Com atestado" value={summary.justified} loading={attendance.isPending} />
      </div>

      <section className="rounded-2xl border bg-card p-4 md:p-6" aria-label="Funcionários">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                  filter === option.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Input
            type="search"
            aria-label="Buscar funcionário"
            placeholder="Buscar por nome ou matrícula"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>

        {attendance.isError ? (
          <Alert variant="destructive" className="mt-4">
            {errorMessage(attendance.error)}
          </Alert>
        ) : attendance.isPending ? (
          <Skeleton className="mt-4 h-48 w-full" />
        ) : shown.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Ninguém nesta situação.</p>
        ) : (
          <>
            <table className="mt-4 hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Funcionário</th>
                  <th className="px-3 py-2 font-semibold">Escala</th>
                  <th className="px-3 py-2 font-semibold">Marcações</th>
                  <th className="px-3 py-2 font-semibold">Trabalhado</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                  <th className="py-2 pl-3">
                    <span className="sr-only">Espelho</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.employee.id} className="border-b last:border-0">
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{item.employee.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.employee.registrationNumber} · {item.employee.unit.name}
                        {item.employee.department ? ` · ${item.employee.department.name}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {plannedText(item)}
                      {canAssign ? (
                        <Link
                          to={`/pessoas/${item.employee.id}`}
                          className="block text-xs font-semibold text-primary underline"
                        >
                          Alterar escala
                          <span className="sr-only"> de {item.employee.name}</span>
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <Entries item={item} />
                    </td>
                    <td className="px-3 py-3 font-mono">
                      {item.workedMinutes > 0 ? formatMinutes(item.workedMinutes) : '—'}
                    </td>
                    <td className="px-3 py-3">{statusBadge(item, isToday)}</td>
                    <td className="py-3 pl-3 text-right">
                      <Link
                        to={`/pessoas/${item.employee.id}/espelho`}
                        className="font-semibold text-primary underline"
                      >
                        Espelho<span className="sr-only"> de {item.employee.name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-4 grid gap-2 md:hidden">
              {shown.map((item) => (
                <li key={item.employee.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/pessoas/${item.employee.id}/espelho`}
                      className="min-w-0 font-semibold"
                    >
                      <span className="block truncate">{item.employee.name}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {item.employee.unit.name} · {plannedText(item)}
                      </span>
                    </Link>
                    {statusBadge(item, isToday)}
                  </div>
                  <div className="mt-2">
                    <Entries item={item} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
