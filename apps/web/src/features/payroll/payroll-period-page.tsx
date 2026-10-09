import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, DownloadIcon, LockIcon, RefreshCwIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { formatBRL, formatDate, formatMinutes, formatSignedMinutes } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { cn } from '@/lib/utils';
import { monthLabel } from '../time-tracking/labels';
import { downloadText, payrollQueryKey } from './labels';
import { PayrollStatusBadge } from './status-badge';

/** Um mês: números por funcionário, pendências a revisar e as ações do fechamento. */
export function PayrollPeriodPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { id = '' } = useParams();
  const [search, setSearch] = useState('');
  const period = useQuery({
    queryKey: [...payrollQueryKey, id],
    queryFn: () => api.payroll.get(id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: payrollQueryKey });

  const regenerate = useMutation({
    mutationFn: () => api.payroll.generate(period.data?.month ?? ''),
    onSuccess: async () => {
      toast.success('Números recalculados.');
      await refresh();
    },
  });
  const publish = useMutation({
    mutationFn: () => api.payroll.publish(id),
    onSuccess: async () => {
      toast.success('Prévia publicada: cada funcionário já vê a sua.');
      await refresh();
    },
  });
  const close = useMutation({
    mutationFn: () => api.payroll.close(id),
    onSuccess: async () => {
      toast.success('Mês fechado.');
      await refresh();
    },
  });
  const exportCsv = useMutation({
    mutationFn: () => api.payroll.exportCsv(id),
    onSuccess: (content) => {
      downloadText(content, `fechamento-${period.data?.month ?? ''}.csv`, 'text/csv;charset=utf-8');
    },
  });

  if (period.isPending) return <Skeleton className="h-96 w-full" />;
  if (period.isError) return <Alert variant="destructive">{errorMessage(period.error)}</Alert>;
  const data = period.data;
  const isClosed = data.status === 'closed';
  const items = data.items.filter((item) => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (
      !term ||
      item.employee.name.toLocaleLowerCase('pt-BR').includes(term) ||
      item.employee.registrationNumber.includes(term)
    );
  });
  const withoutSalary = data.items.filter((i) => i.baseSalary === null);
  const pendingAdjustments = data.items.reduce((sum, i) => sum + i.pendingAdjustments, 0);
  const incomplete = data.items.filter((i) => i.incompleteDays > 0);
  const busy = regenerate.isPending || publish.isPending || close.isPending;
  const error = regenerate.error ?? publish.error ?? close.error ?? exportCsv.error;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/gestao/folha"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          Folha de pagamento
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold capitalize">{monthLabel(data.month)}</h1>
          <PayrollStatusBadge status={data.status} />
        </div>
        <p className="text-muted-foreground">
          Contado até {formatDate(data.cutoffDate)} · gerado em{' '}
          {new Date(data.generatedAt).toLocaleString('pt-BR')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {isClosed ? null : (
          <Button variant="outline" disabled={busy} onClick={() => regenerate.mutate()}>
            {regenerate.isPending ? <Spinner /> : <RefreshCwIcon />}
            Recalcular
          </Button>
        )}
        {data.status === 'draft' ? (
          <Button variant="outline" disabled={busy} onClick={() => publish.mutate()}>
            {publish.isPending ? <Spinner /> : <SendIcon />}
            Publicar prévia aos funcionários
          </Button>
        ) : null}
        {isClosed ? null : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  'Fechar o mês? Depois disso os números não mudam mais (nem recalculando).',
                )
              ) {
                close.mutate();
              }
            }}
          >
            {close.isPending ? <Spinner /> : <LockIcon />}
            Fechar mês
          </Button>
        )}
        <Button disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
          {exportCsv.isPending ? <Spinner /> : <DownloadIcon />}
          Exportar para a contabilidade (CSV)
        </Button>
      </div>
      {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}

      {!isClosed &&
      (withoutSalary.length > 0 || pendingAdjustments > 0 || incomplete.length > 0) ? (
        <Alert variant="warning">
          <p className="font-semibold">Revise antes de fechar:</p>
          <ul className="mt-1 list-disc pl-5">
            {withoutSalary.length > 0 ? (
              <li>
                {withoutSalary.length} funcionário(s) sem salário base no cargo (Cadastros ›
                Cargos).
              </li>
            ) : null}
            {pendingAdjustments > 0 ? (
              <li>{pendingAdjustments} ajuste(s) de ponto ainda sem decisão.</li>
            ) : null}
            {incomplete.length > 0 ? (
              <li>{incomplete.length} funcionário(s) com dias de marcação incompleta.</li>
            ) : null}
          </ul>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <StatCard label="Funcionários" value={data.items.length} />
        <StatCard
          label="Salários base"
          value={formatBRL(data.items.reduce((sum, i) => sum + (i.baseSalary ?? 0), 0))}
        />
        <StatCard
          label="Benefícios (empresa)"
          value={formatBRL(data.items.reduce((sum, i) => sum + i.benefitsCompanyTotal, 0))}
        />
        <StatCard
          label="Faltas"
          value={data.items.reduce((sum, i) => sum + i.absenceDays, 0)}
          note="Dias com turno, sem marcação e sem atestado"
          tone={data.items.some((i) => i.absenceDays > 0) ? 'warning' : 'muted'}
        />
      </div>

      <section className="rounded-2xl border bg-card p-4 md:p-6" aria-label="Funcionários">
        <Input
          type="search"
          aria-label="Buscar funcionário"
          placeholder="Buscar por nome ou matrícula"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72"
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Funcionário</th>
                <th className="px-3 py-2 font-semibold">Salário base</th>
                <th className="px-3 py-2 font-semibold">Previsto</th>
                <th className="px-3 py-2 font-semibold">Trabalhado</th>
                <th className="px-3 py-2 font-semibold">Saldo</th>
                <th className="px-3 py-2 font-semibold">Faltas</th>
                <th className="px-3 py-2 font-semibold">Atestado</th>
                <th className="px-3 py-2 font-semibold">Incompletos</th>
                <th className="py-2 pl-3 font-semibold">Benefícios</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.employee.id} className="border-b last:border-0 align-top">
                  <td className="py-3 pr-3">
                    <Link
                      to={`/pessoas/${item.employee.id}`}
                      className="font-semibold hover:underline"
                    >
                      {item.employee.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {item.employee.registrationNumber} · {item.position ?? 'Sem cargo'} ·{' '}
                      {item.unit}
                    </p>
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3',
                      item.baseSalary === null && 'font-semibold text-warning',
                    )}
                  >
                    {item.baseSalary === null ? 'Sem salário' : formatBRL(item.baseSalary)}
                  </td>
                  <td className="px-3 py-3 font-mono">{formatMinutes(item.plannedMinutes)}</td>
                  <td className="px-3 py-3 font-mono">{formatMinutes(item.workedMinutes)}</td>
                  <td
                    className={cn(
                      'px-3 py-3 font-mono',
                      item.balanceMinutes < 0 ? 'text-warning' : 'text-primary',
                    )}
                  >
                    {formatSignedMinutes(item.balanceMinutes)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3',
                      item.absenceDays > 0 && 'font-semibold text-warning',
                    )}
                  >
                    {item.absenceDays}
                  </td>
                  <td className="px-3 py-3">{item.justifiedDays}</td>
                  <td className="px-3 py-3">{item.incompleteDays}</td>
                  <td className="py-3 pl-3">
                    {formatBRL(item.benefitsCompanyTotal)}
                    <span className="block text-xs text-muted-foreground">
                      desconto {formatBRL(item.benefitsDiscountTotal)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Saldo = trabalhado − previsto, sem regras legais. Horas extras, adicionais, DSR, impostos
          e encargos são calculados pela contabilidade.
        </p>
      </section>
    </div>
  );
}
