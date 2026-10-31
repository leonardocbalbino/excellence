import {
  type BenefitDaysSummary,
  DAILY_BENEFIT_LABELS,
  type DailyBenefitKind,
  type DailyBenefitLine,
  PAYROLL_STATUS_LABELS,
} from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, Undo2Icon } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { formatBRL, formatDate } from '@/lib/format';
import { numberOrNull } from '@/lib/form-values';
import { errorMessage, useApi } from '@/lib/services';
import { cn } from '@/lib/utils';
import { currentMonth, monthLabel } from '../time-tracking/labels';
import { benefitDaysQueryKey } from './labels';

type Row = BenefitDaysSummary['rows'][number];

const KINDS: readonly DailyBenefitKind[] = ['food', 'transport'];
const SHORT: Record<DailyBenefitKind, string> = { food: 'VA', transport: 'VT' };

const numberCell = 'px-3 py-2 text-right tabular-nums';

function isAdjusted(row: Row): boolean {
  return Boolean(row.food?.adjustment ?? row.transport?.adjustment);
}

/** Valor do ajuste para o campo de texto (vírgula decimal); sem valor, vazio. */
function fieldText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

/** Dias, valor diário e total de VA ou VT; com ajuste, mostra também o calculado. */
function LineCells({ line }: { line: DailyBenefitLine | null }) {
  if (!line) {
    return (
      <>
        <td className={cn(numberCell, 'text-muted-foreground')}>—</td>
        <td className={cn(numberCell, 'text-muted-foreground')}>—</td>
        <td className={cn(numberCell, 'text-muted-foreground')}>—</td>
      </>
    );
  }
  const adjusted = line.adjustment !== null;
  return (
    <>
      <td className={cn(numberCell, adjusted && line.adjustment?.days !== null && 'text-warning')}>
        {line.days}
      </td>
      <td
        className={cn(
          numberCell,
          adjusted && line.adjustment?.dailyValue !== null && 'text-warning',
        )}
      >
        {formatBRL(line.dailyValue)}
      </td>
      <td className={numberCell}>
        <span className="font-semibold">{formatBRL(line.total)}</span>
        {adjusted ? (
          <span
            className="block text-xs text-muted-foreground"
            title={`Motivo: ${line.adjustment?.reason ?? ''}`}
          >
            calculado {line.calculated.days} × {formatBRL(line.calculated.dailyValue)}
          </span>
        ) : null}
      </td>
    </>
  );
}

/** Exceção no VA ou VT do funcionário: o que ficar vazio segue o cálculo. */
function AdjustForm({ row, month, onDone }: { row: Row; month: string; onDone: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DailyBenefitKind>(row.food ? 'food' : 'transport');
  const current = row[kind];
  const [days, setDays] = useState(() => fieldText(current?.adjustment?.days));
  const [dailyValue, setDailyValue] = useState(() => fieldText(current?.adjustment?.dailyValue));
  const [reason, setReason] = useState(current?.adjustment?.reason ?? '');
  const refresh = () => queryClient.invalidateQueries({ queryKey: benefitDaysQueryKey });

  const choose = (next: DailyBenefitKind) => {
    const adjustment = row[next]?.adjustment;
    setKind(next);
    setDays(fieldText(adjustment?.days));
    setDailyValue(fieldText(adjustment?.dailyValue));
    setReason(adjustment?.reason ?? '');
  };

  const save = useMutation({
    mutationFn: () =>
      api.payroll.adjustBenefitDays({
        employeeId: row.employee.id,
        month,
        kind,
        days: days.trim() === '' ? null : Number(days),
        dailyValue: numberOrNull(dailyValue),
        reason,
      }),
    onSuccess: async () => {
      toast.success(`${SHORT[kind]} de ${row.employee.name} ajustado.`);
      await refresh();
      onDone();
    },
  });
  const undo = useMutation({
    mutationFn: (id: string) => api.payroll.removeBenefitDaysAdjustment(id),
    onSuccess: async () => {
      toast.success('Ajuste desfeito: vale o valor calculado.');
      await refresh();
      onDone();
    },
  });
  const error = save.error ?? undo.error;
  const calculated = current?.calculated;

  return (
    <form
      className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-5"
      aria-label={`Ajustar VA/VT de ${row.employee.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="adjust-kind">Benefício</Label>
        <Select
          id="adjust-kind"
          value={kind}
          onChange={(e) => choose(e.target.value as DailyBenefitKind)}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {DAILY_BENEFIT_LABELS[k]}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="adjust-days">Quantidade de dias</Label>
        <Input
          id="adjust-days"
          inputMode="numeric"
          placeholder={calculated ? `Calculado: ${calculated.days}` : 'Dias'}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="adjust-daily">Valor-base diário (R$)</Label>
        <Input
          id="adjust-daily"
          inputMode="decimal"
          placeholder={calculated ? `Calculado: ${formatBRL(calculated.dailyValue)}` : 'R$'}
          value={dailyValue}
          onChange={(e) => setDailyValue(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="adjust-reason">Motivo</Label>
        <Input
          id="adjust-reason"
          placeholder="Ex.: cobertura em outro posto, viagem a serviço"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">
        Deixe vazio o que deve seguir o cálculo. O total passa a ser dias × valor diário.
      </p>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
        <Button
          type="submit"
          disabled={
            save.isPending || reason.trim().length < 3 || (!days.trim() && !dailyValue.trim())
          }
        >
          {save.isPending ? <Spinner /> : null}
          Salvar ajuste
        </Button>
        {current?.adjustment ? (
          <Button
            type="button"
            variant="outline"
            disabled={undo.isPending}
            onClick={() => current.adjustment && undo.mutate(current.adjustment.id)}
          >
            <Undo2Icon />
            Desfazer ajuste do {SHORT[kind]}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive" className="sm:col-span-2 lg:col-span-5">
          {errorMessage(error)}
        </Alert>
      ) : null}
    </form>
  );
}

/**
 * VA e VT do mês numa tela só (ADR 0021): dias, valor-base diário e total de cada um por
 * colaborador, calculados pelo ponto e pelas regras do benefício, o total geral VA + VT e o
 * resumo mensal da empresa e dos postos. Exceções são ajustadas aqui antes do fechamento.
 */
export function BenefitDaysPage() {
  const api = useApi();
  const [month, setMonth] = useState(currentMonth);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const summary = useQuery({
    queryKey: [...benefitDaysQueryKey, month],
    queryFn: () => api.payroll.benefitDays(month),
    enabled: /^\d{4}-\d{2}$/.test(month),
  });
  const data = summary.data;
  const isClosed = data?.period?.status === 'closed';
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const rows =
    data?.rows.filter(
      (row) =>
        !term ||
        row.employee.name.toLocaleLowerCase('pt-BR').includes(term) ||
        row.employee.registrationNumber.includes(term),
    ) ?? [];
  const adjustedCount = data?.rows.filter(isAdjusted).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">VA/VT</h1>
        <p className="max-w-3xl text-muted-foreground">
          Vale-alimentação e vale-transporte do mês, calculados pelo ponto e pela regra de cada
          benefício (Remuneração › Benefícios). Ajuste as exceções antes de fechar o mês na Folha.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="benefit-days-month">Mês</Label>
          <Input
            id="benefit-days-month"
            type="month"
            className="w-48"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setEditing(null);
            }}
          />
        </div>
        {data ? (
          <p className="text-sm text-muted-foreground">
            Ponto contado até {formatDate(data.cutoffDate)}.{' '}
            {data.period ? (
              <>
                Fechamento de <span className="capitalize">{monthLabel(month)}</span>:{' '}
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
      {isClosed ? (
        <Alert>Mês fechado: os valores são os congelados no fechamento e não aceitam ajuste.</Alert>
      ) : data?.period && adjustedCount > 0 ? (
        <Alert variant="warning">
          O fechamento deste mês já foi gerado. Depois de ajustar, use “Recalcular” na{' '}
          <Link to={`/gestao/folha/${data.period.id}`} className="font-semibold underline">
            Folha
          </Link>{' '}
          para levar os novos valores.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={DAILY_BENEFIT_LABELS.food}
          value={formatBRL(data?.totals.food.total ?? 0)}
          note={`${data?.totals.food.days ?? 0} dias`}
          loading={summary.isPending}
        />
        <StatCard
          label={DAILY_BENEFIT_LABELS.transport}
          value={formatBRL(data?.totals.transport.total ?? 0)}
          note={`${data?.totals.transport.days ?? 0} dias`}
          loading={summary.isPending}
        />
        <StatCard
          label="Total VA + VT"
          value={formatBRL(data?.totals.total ?? 0)}
          tone="primary"
          note="Resumo mensal da empresa"
          loading={summary.isPending}
        />
        <StatCard
          label="Colaboradores"
          value={data?.totals.employees ?? 0}
          loading={summary.isPending}
          {...(adjustedCount > 0
            ? { note: `${adjustedCount} com ajuste no mês`, tone: 'warning' as const }
            : {})}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Por colaborador</CardTitle>
          <Input
            type="search"
            aria-label="Buscar colaborador"
            placeholder="Buscar por nome ou matrícula"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[62rem] text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th rowSpan={2} className="py-2 pr-3 text-left font-semibold">
                  Colaborador
                </th>
                <th colSpan={3} className="border-l px-3 py-2 text-center font-semibold">
                  {DAILY_BENEFIT_LABELS.food}
                </th>
                <th colSpan={3} className="border-l px-3 py-2 text-center font-semibold">
                  {DAILY_BENEFIT_LABELS.transport}
                </th>
                <th rowSpan={2} className="border-l px-3 py-2 text-right font-semibold">
                  Total VA + VT
                </th>
                <th rowSpan={2} className="py-2 pl-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
              <tr className="border-b text-xs text-muted-foreground">
                {KINDS.map((kind) => (
                  <Fragment key={kind}>
                    <th className="border-l px-3 py-1 text-right font-medium">Dias</th>
                    <th className="px-3 py-1 text-right font-medium">Valor diário</th>
                    <th className="px-3 py-1 text-right font-medium">Total</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.isPending ? (
                <tr>
                  <td colSpan={9} className="py-3">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    {term
                      ? 'Nenhum colaborador encontrado.'
                      : 'Ninguém com VA ou VT calculado por dia neste mês. Defina a regra em Benefícios e atribua no cadastro do funcionário.'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={row.employee.id}>
                    <tr className="border-b align-top last:border-0">
                      <td className="py-2 pr-3">
                        <Link
                          to={`/pessoas/${row.employee.id}/espelho`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {row.employee.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {row.employee.registrationNumber} · {row.unit}
                        </span>
                        {isAdjusted(row) ? (
                          <Badge variant="warning" className="mt-1">
                            Ajustado
                          </Badge>
                        ) : null}
                      </td>
                      <LineCells line={row.food} />
                      <LineCells line={row.transport} />
                      <td className={cn(numberCell, 'border-l font-bold')}>
                        {formatBRL(row.total)}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {isClosed ? null : (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Ajustar VA/VT de ${row.employee.name}`}
                            onClick={() =>
                              setEditing(editing === row.employee.id ? null : row.employee.id)
                            }
                          >
                            <PencilIcon />
                            Ajustar
                          </Button>
                        )}
                      </td>
                    </tr>
                    {editing === row.employee.id ? (
                      <tr className="border-b">
                        <td colSpan={9} className="py-3">
                          <AdjustForm row={row} month={month} onDone={() => setEditing(null)} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
            {data && data.rows.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="py-2 pr-3">Total geral</td>
                  <td className={numberCell}>{data.totals.food.days}</td>
                  <td className={numberCell} />
                  <td className={numberCell}>{formatBRL(data.totals.food.total)}</td>
                  <td className={numberCell}>{data.totals.transport.days}</td>
                  <td className={numberCell} />
                  <td className={numberCell}>{formatBRL(data.totals.transport.total)}</td>
                  <td className={cn(numberCell, 'border-l font-bold')}>
                    {formatBRL(data.totals.total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Resumo mensal · <span className="capitalize">{monthLabel(month)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-3 text-left font-semibold">Posto de trabalho</th>
                <th className="px-3 py-2 text-right font-semibold">Colaboradores</th>
                <th className="px-3 py-2 text-right font-semibold">VA (dias)</th>
                <th className="px-3 py-2 text-right font-semibold">VA</th>
                <th className="px-3 py-2 text-right font-semibold">VT (dias)</th>
                <th className="px-3 py-2 text-right font-semibold">VT</th>
                <th className="py-2 pl-3 text-right font-semibold">VA + VT</th>
              </tr>
            </thead>
            <tbody>
              {data?.units.map((unit) => (
                <tr key={unit.unit} className="border-b">
                  <td className="py-2 pr-3">{unit.unit}</td>
                  <td className={numberCell}>{unit.employees}</td>
                  <td className={numberCell}>{unit.food.days}</td>
                  <td className={numberCell}>{formatBRL(unit.food.total)}</td>
                  <td className={numberCell}>{unit.transport.days}</td>
                  <td className={numberCell}>{formatBRL(unit.transport.total)}</td>
                  <td className={cn(numberCell, 'pr-0')}>{formatBRL(unit.total)}</td>
                </tr>
              ))}
            </tbody>
            {data ? (
              <tfoot>
                <tr className="font-bold">
                  <td className="py-2 pr-3">Empresa</td>
                  <td className={numberCell}>{data.totals.employees}</td>
                  <td className={numberCell}>{data.totals.food.days}</td>
                  <td className={numberCell}>{formatBRL(data.totals.food.total)}</td>
                  <td className={numberCell}>{data.totals.transport.days}</td>
                  <td className={numberCell}>{formatBRL(data.totals.transport.total)}</td>
                  <td className={cn(numberCell, 'pr-0')}>{formatBRL(data.totals.total)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
