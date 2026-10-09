import type { PatrolRun } from '@excellence/shared';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { localTime, runStatusText } from './labels';

/** Rondas em andamento com barra de progresso (visão geral e quadro de rondas). */
export function RunProgressList({ runs }: { runs: PatrolRun[] }) {
  if (runs.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Nenhuma ronda em andamento.</p>;
  }
  return (
    <ul className="mt-4 grid gap-4">
      {runs.map((run) => {
        const late = run.lateMinutes > 0;
        const ratio = run.total > 0 ? run.checked / run.total : 0;
        return (
          <li key={run.id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <Link to={`/gestao/rondas/${run.id}`} className="font-semibold hover:underline">
                {run.route.name}
              </Link>
              <span className={late ? 'font-semibold text-warning' : 'text-muted-foreground'}>
                {late
                  ? runStatusText(run)
                  : `${String(run.checked)} de ${String(run.total)} pontos`}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={`Pontos registrados em ${run.route.name}`}
              aria-valuemin={0}
              aria-valuemax={run.total}
              aria-valuenow={run.checked}
            >
              <div
                className={cn('h-full rounded-full', late ? 'bg-warning' : 'bg-primary')}
                style={{ width: `${String(Math.max(4, Math.round(ratio * 100)))}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {run.employee.name} ·{' '}
              {late && run.nextPoint
                ? `próximo ponto: ${run.nextPoint.name}`
                : `iniciada ${localTime(run.startedAt, run.timezone)}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
