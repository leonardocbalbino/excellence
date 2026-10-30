import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/ui/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { OccurrenceCard } from '../../patrols/occurrence-card';
import { occurrencesQueryKey } from '../../patrols/occurrence-keys';

/**
 * Rondas do mês no posto (ADR 0024): horários previstos, rondas feitas, incompletas e
 * perdidas por rota, e as ocorrências com o que foi feito e a resolução.
 */
export function UnitPatrolsTab({ unitId }: { unitId: string }) {
  const api = useApi();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const summary = useQuery({
    queryKey: [...occurrencesQueryKey, 'unit', unitId, month],
    queryFn: () => api.patrols.unitSummary(unitId, month),
    enabled: /^\d{4}-\d{2}$/.test(month),
  });
  const data = summary.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-2">
        <Label htmlFor="patrols-month">Mês</Label>
        <Input
          id="patrols-month"
          type="month"
          className="w-48"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>
      {summary.isError ? <Alert variant="destructive">{errorMessage(summary.error)}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Rondas previstas"
          value={data?.totals.scheduled ?? 0}
          loading={summary.isPending}
        />
        <StatCard label="Feitas" value={data?.totals.completed ?? 0} loading={summary.isPending} />
        <StatCard
          label="Incompletas"
          value={data?.totals.incomplete ?? 0}
          loading={summary.isPending}
          {...(data && data.totals.incomplete > 0 ? { tone: 'warning' as const } : {})}
        />
        <StatCard
          label="Não iniciadas"
          value={data?.totals.missed ?? 0}
          loading={summary.isPending}
          {...(data && data.totals.missed > 0 ? { tone: 'warning' as const } : {})}
        />
        <StatCard
          label="Ocorrências"
          value={data?.totals.occurrences ?? 0}
          loading={summary.isPending}
          note={`${String(data?.totals.openOccurrences ?? 0)} em aberto`}
          {...(data && data.totals.openOccurrences > 0 ? { tone: 'warning' as const } : {})}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por rota</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rota</TableHead>
              <TableHead className="text-right">Previstas</TableHead>
              <TableHead className="text-right">Feitas</TableHead>
              <TableHead className="text-right">Incompletas</TableHead>
              <TableHead className="text-right">Não iniciadas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.routes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhuma ronda prevista ou feita no mês.
                </TableCell>
              </TableRow>
            ) : (
              data?.routes.map((line) => (
                <TableRow key={line.route.id}>
                  <TableCell className="font-medium">{line.route.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.scheduled}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.completed}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.incomplete}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.missed}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ocorrências do mês</h2>
        {data?.occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ocorrência no mês.</p>
        ) : (
          data?.occurrences.map((occurrence) => (
            <OccurrenceCard key={occurrence.id} occurrence={occurrence} showUnit={false} />
          ))
        )}
      </section>
    </div>
  );
}
