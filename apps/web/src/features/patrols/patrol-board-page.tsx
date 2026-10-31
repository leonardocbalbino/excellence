import type { PatrolRun, PatrolSlot } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/ui/stat-card';
import { formatDate, todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { localTime, patrolBoardQueryKey, runStatusText, SLOT_STATUS } from './labels';
import { RunProgressList } from './run-progress';

function slotBadge(slot: PatrolSlot) {
  const variant =
    slot.status === 'missed'
      ? 'warning'
      : slot.status === 'done'
        ? 'soft'
        : slot.status === 'in_progress'
          ? 'default'
          : 'outline';
  return <Badge variant={variant}>{SLOT_STATUS[slot.status]}</Badge>;
}

function runBadge(run: PatrolRun) {
  if (run.status === 'in_progress') {
    return (
      <Badge variant={run.lateMinutes > 0 ? 'warning' : 'default'}>{runStatusText(run)}</Badge>
    );
  }
  return (
    <Badge variant={run.status === 'completed' ? 'soft' : 'warning'}>{runStatusText(run)}</Badge>
  );
}

/**
 * Rondas do dia (gestão): em andamento, feitas e horários previstos, no escopo do perfil. As
 * rondas de quem consulta não aparecem aqui (ficam na área pessoal).
 */
export function PatrolBoardPage() {
  const api = useApi();
  const today = todayIso();
  const [date, setDate] = useState(today);
  const board = useQuery({
    queryKey: [...patrolBoardQueryKey, date],
    queryFn: () => api.patrols.board(date),
    refetchInterval: date === today ? 30_000 : false,
  });
  const runs = board.data?.runs ?? [];
  const slots = board.data?.slots ?? [];
  const active = runs.filter((r) => r.status === 'in_progress');
  const late = active.filter((r) => r.lateMinutes > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{formatDate(date)}</p>
          <h1 className="text-3xl font-bold">Rondas do dia</h1>
          <p className="text-muted-foreground">
            Acompanhe as rondas da sua equipe em tempo real e os horários previstos.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="patrol-date">Data</Label>
          <Input
            id="patrol-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || today)}
            className="w-44"
          />
        </div>
      </div>

      {board.isError ? <Alert variant="destructive">{errorMessage(board.error)}</Alert> : null}

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard
          label="Em andamento"
          value={active.length}
          note={late.length > 0 ? `${String(late.length)} atrasada(s)` : 'Nenhuma atrasada'}
          tone={late.length > 0 ? 'warning' : 'muted'}
          loading={board.isPending}
        />
        <StatCard
          label="Concluídas"
          value={runs.filter((r) => r.status === 'completed').length}
          loading={board.isPending}
        />
        <StatCard
          label="Incompletas"
          value={runs.filter((r) => r.status === 'incomplete').length}
          tone="warning"
          note="Encerradas faltando pontos"
          loading={board.isPending}
        />
        <StatCard
          label="Não iniciadas"
          value={slots.filter((s) => s.status === 'missed').length}
          note="Horário previsto passou sem ronda"
          tone={slots.some((s) => s.status === 'missed') ? 'warning' : 'muted'}
          loading={board.isPending}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[24rem_1fr]">
        <section aria-labelledby="rondas-agora" className="rounded-2xl border bg-card p-4 md:p-6">
          <h2 id="rondas-agora" className="text-xl font-bold md:text-2xl">
            Rondas agora
          </h2>
          {board.isPending ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : (
            <RunProgressList runs={active} />
          )}
        </section>

        <section aria-labelledby="horarios" className="rounded-2xl border bg-card p-4 md:p-6">
          <h2 id="horarios" className="text-xl font-bold md:text-2xl">
            Horários previstos
          </h2>
          {board.isPending ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : slots.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhum horário previsto neste dia.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {slots.map((slot) => (
                <li
                  key={`${slot.route.id}-${slot.at}`}
                  className="flex items-center gap-3 py-2.5 text-sm"
                >
                  <span className="w-14 font-mono font-medium">{slot.localTime}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{slot.route.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {slot.unit.name}
                    </span>
                  </span>
                  {slotBadge(slot)}
                  {slot.runId ? (
                    <Link
                      to={`/gestao/rondas/${slot.runId}`}
                      className="font-semibold text-primary underline"
                    >
                      Ver<span className="sr-only"> ronda das {slot.localTime}</span>
                    </Link>
                  ) : (
                    <span className="w-8" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="todas" className="rounded-2xl border bg-card p-4 md:p-6">
        <h2 id="todas" className="text-xl font-bold md:text-2xl">
          Todas as rondas do dia
        </h2>
        {board.isPending ? (
          <Skeleton className="mt-4 h-24 w-full" />
        ) : runs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma ronda iniciada.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-14 font-mono">{localTime(run.startedAt, run.timezone)}</span>
                <span className="min-w-0 flex-1">
                  <Link to={`/gestao/rondas/${run.id}`} className="font-semibold hover:underline">
                    {run.route.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {run.employee.name} · {run.checked} de {run.total} pontos
                    {run.scheduledFor ? '' : ' · fora de horário'}
                  </span>
                </span>
                {runBadge(run)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
