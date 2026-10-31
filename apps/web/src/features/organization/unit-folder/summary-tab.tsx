import { PAYROLL_STATUS_LABELS, type PayrollItem } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
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
import { formatBRL, formatDate, todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { CERTIFICATE_STATUS } from '../../medical/labels';
import { formatMonth } from './months';

const unitSummaryQueryKey = ['unit-monthly-summary'] as const;

function ShiftDetail({ item }: { item: PayrollItem }) {
  if (item.shiftPay.lines.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="grid gap-0.5 text-xs text-muted-foreground">
      {item.shiftPay.lines.map((line) => (
        <li key={line.scheduleId}>
          {line.schedule}: {line.shifts} ×{' '}
          {line.rate === null ? (
            <span className="font-semibold text-warning">sem valor</span>
          ) : (
            formatBRL(line.rate)
          )}
          {line.justifiedShifts > 0 ? ` · ${line.justifiedShifts} com atestado` : ''}
        </li>
      ))}
    </ul>
  );
}

/**
 * Tudo o que aconteceu no posto no mês: plantões e valores por funcionário, faltas,
 * atestados e trocas de escala. Calculado na hora; o fechamento oficial fica na Folha.
 */
export function UnitSummaryTab({ unitId }: { unitId: string }) {
  const api = useApi();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const summary = useQuery({
    queryKey: [...unitSummaryQueryKey, unitId, month],
    queryFn: () => api.payroll.unitSummary(unitId, month),
    enabled: /^\d{4}-\d{2}$/.test(month),
  });
  const data = summary.data;
  const missingRates = data?.items.some((item) =>
    item.shiftPay.lines.some((line) => line.rate === null && line.shifts > 0),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <Label htmlFor="summary-month">Mês</Label>
          <Input
            id="summary-month"
            type="month"
            className="w-48"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        {data ? (
          <p className="text-sm text-muted-foreground">
            Ponto contado até {formatDate(data.cutoffDate)}.{' '}
            {data.period ? (
              <>
                Fechamento de {formatMonth(month)}:{' '}
                <Link
                  to={`/gestao/folha/${data.period.id}`}
                  className="text-primary hover:underline"
                >
                  {PAYROLL_STATUS_LABELS[data.period.status]}
                </Link>
              </>
            ) : (
              'O fechamento do mês ainda não foi gerado.'
            )}
          </p>
        ) : null}
      </div>

      {summary.isError ? <Alert variant="destructive">{errorMessage(summary.error)}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Funcionários no mês"
          value={data?.totals.employees ?? 0}
          loading={summary.isPending}
        />
        <StatCard
          label="Plantões trabalhados"
          value={data?.totals.shifts ?? 0}
          loading={summary.isPending}
        />
        <StatCard
          label="Valor dos plantões"
          value={formatBRL(data?.totals.shiftPay ?? 0)}
          loading={summary.isPending}
          {...(missingRates ? { note: 'Há escala sem valor cadastrado', tone: 'warning' } : {})}
        />
        <StatCard
          label="Faltas"
          value={data?.totals.absenceDays ?? 0}
          suffix="dias"
          loading={summary.isPending}
          {...(data
            ? {
                note: `Sem contar ${data.totals.justifiedDays} dia(s) com atestado. ${data.totals.incompleteDays} com marcação incompleta.`,
              }
            : {})}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funcionários</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Plantões</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Faltas</TableHead>
              <TableHead className="text-right">Atestado (dias)</TableHead>
              <TableHead className="text-right">Ajustes pendentes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.isPending ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhum funcionário ativo no posto neste mês.
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((item) => (
                <TableRow key={item.employee.id}>
                  <TableCell>
                    <Link
                      to={`/pessoas/${item.employee.id}/espelho`}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.employee.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      Matrícula {item.employee.registrationNumber}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium tabular-nums">{item.shiftPay.shifts}</span>
                    <ShiftDetail item={item} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBRL(item.shiftPay.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.absenceDays}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.justifiedDays}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.pendingAdjustments}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atestados do mês</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.certificates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum atestado no período.</p>
            ) : (
              <ul className="grid gap-2">
                {data?.certificates.map((certificate) => (
                  <li
                    key={certificate.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{certificate.employee.name}</span>{' '}
                      <span className="text-muted-foreground">
                        {certificate.startDate === certificate.endDate
                          ? formatDate(certificate.startDate)
                          : `${formatDate(certificate.startDate)} a ${formatDate(certificate.endDate)}`}
                      </span>
                    </span>
                    <Badge variant={certificate.status === 'accepted' ? 'default' : 'secondary'}>
                      {CERTIFICATE_STATUS[certificate.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trocas de escala</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.scheduleChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma troca de escala no mês.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {data?.scheduleChanges.map((change) => (
                  <li key={`${change.employee.id}-${change.startDate}`}>
                    <span className="font-medium">{change.employee.name}</span> passou para{' '}
                    {change.schedule} em {formatDate(change.startDate)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
