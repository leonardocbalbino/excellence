import type { PlannedDay } from '@excellence/shared';
import { Badge } from '@/components/ui/badge';
import { formatDayLabel, formatMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Lista dia a dia da escala prevista (turno, folga, feriado). */
export function PlannedDays({ days, today }: { days: PlannedDay[]; today: string }) {
  return (
    <ol className="divide-y rounded-lg border">
      {days.map((day) => (
        <li
          key={day.date}
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm',
            day.date === today && 'bg-accent',
          )}
          aria-current={day.date === today ? 'date' : undefined}
        >
          <span className="w-28 font-medium capitalize">{formatDayLabel(day.date)}</span>
          <span className="flex-1">
            {day.unassigned ? (
              <span className="text-muted-foreground">Sem escala</span>
            ) : day.shift ? (
              <>
                {day.shift.start} às {day.shift.end}
                {day.shift.crossesMidnight ? ' (+1 dia)' : ''}
                <span className="text-muted-foreground">
                  {' '}
                  · {day.shift.name} · {formatMinutes(day.shift.workMinutes)}
                </span>
              </>
            ) : day.flexibleWeeklyMinutes !== null ? (
              <span className="text-muted-foreground">
                Horário flexível ({formatMinutes(day.flexibleWeeklyMinutes)} por semana)
              </span>
            ) : (
              <span className="text-muted-foreground">Folga</span>
            )}
          </span>
          {day.holiday ? <Badge variant="outline">Feriado: {day.holiday.name}</Badge> : null}
        </li>
      ))}
    </ol>
  );
}
