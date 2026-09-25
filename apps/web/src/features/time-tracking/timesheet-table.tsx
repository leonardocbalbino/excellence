import type { Timesheet } from '@excellence/shared';
import { MapPinOffIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDayLabel, formatMinutes } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Espelho do mês: previsto, marcações efetivas e minutos trabalhados (pares entrada/saída).
 * Horas extras, adicional noturno e tolerâncias vêm do motor de cálculo (etapa 1B.4).
 */
export function TimesheetTable({
  timesheet,
  onSelectEntry,
}: {
  timesheet: Timesheet;
  /** Clique numa marcação (ex.: pedir para desconsiderar). */
  onSelectEntry?: (entry: { id: string; date: string; time: string }) => void;
}) {
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dia</TableHead>
            <TableHead>Previsto</TableHead>
            <TableHead>Marcações</TableHead>
            <TableHead className="text-right">Trabalhado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {timesheet.days.map((day) => (
            <TableRow key={day.date} className={cn(day.incomplete && 'bg-amber-500/5')}>
              <TableCell className="whitespace-nowrap capitalize">
                {formatDayLabel(day.date)}
                {day.planned.holiday ? (
                  <Badge variant="outline" className="ml-2">
                    {day.planned.holiday.name}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {day.planned.shift
                  ? `${day.planned.shift.start}–${day.planned.shift.end}`
                  : day.planned.unassigned
                    ? 'Sem escala'
                    : day.planned.flexibleWeeklyMinutes !== null
                      ? 'Flexível'
                      : 'Folga'}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  {day.entries.map((entry) => {
                    const label = `${entry.localTime}${entry.nextDay ? '⁺¹' : ''}`;
                    const content = (
                      <>
                        {label}
                        {entry.kind === 'inclusion' ? '*' : ''}
                        {entry.geofenceStatus === 'outside' ? (
                          <MapPinOffIcon
                            className="size-3 text-destructive"
                            aria-label="fora da área"
                          />
                        ) : null}
                      </>
                    );
                    return onSelectEntry ? (
                      <button
                        key={entry.id}
                        type="button"
                        className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-xs hover:bg-accent"
                        onClick={() => onSelectEntry({ id: entry.id, date: day.date, time: label })}
                      >
                        {content}
                      </button>
                    ) : (
                      <span
                        key={entry.id}
                        className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-xs"
                      >
                        {content}
                      </span>
                    );
                  })}
                  {day.justifications.map((j) => (
                    <Badge key={j.id} variant="outline">
                      Atestado{j.startTime ? ` ${j.startTime}–${j.endTime ?? ''}` : ''}
                    </Badge>
                  ))}
                  {day.incomplete ? <Badge variant="secondary">Falta marcação</Badge> : null}
                  {day.pendingAdjustments > 0 ? (
                    <Badge variant="outline">{day.pendingAdjustments} ajuste(s) pendente(s)</Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {day.workedMinutes > 0 ? formatMinutes(day.workedMinutes) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <span>
          * incluída por ajuste · ⁺¹ no dia seguinte · horários no fuso {timesheet.timezone}
        </span>
        <span>
          Trabalhado: <strong>{formatMinutes(timesheet.totals.workedMinutes)}</strong> · Previsto:{' '}
          {formatMinutes(timesheet.totals.plannedMinutes)}
        </span>
      </p>
    </div>
  );
}
