import { BENEFIT_KIND_LABELS, type MyPayrollPreview } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatBRL, formatDate, formatMinutes, formatSignedMinutes } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { cn } from '@/lib/utils';
import { monthLabel } from '../time-tracking/labels';
import { myPayrollQueryKey } from './labels';
import { PayrollStatusBadge } from './status-badge';

/** Prévia da folha do funcionário, publicada pelo RH a cada mês. */
export function MyPayrollPage() {
  const api = useApi();
  const previews = useQuery({ queryKey: myPayrollQueryKey, queryFn: () => api.payroll.mine() });
  const [month, setMonth] = useState<string | null>(null);
  const selected = previews.data?.find((p) => p.month === month) ?? previews.data?.[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Prévia da folha</h1>
        <p className="text-muted-foreground">
          O resumo do seu mês que vai para a contabilidade. Os valores finais (impostos, horas
          extras e descontos legais) vêm no holerite.
        </p>
      </div>
      {previews.isError ? (
        <Alert variant="destructive">{errorMessage(previews.error)}</Alert>
      ) : previews.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : !selected ? (
        <Alert>Nenhuma prévia publicada ainda. O RH publica depois de fechar cada mês.</Alert>
      ) : (
        <>
          {previews.data.length > 1 ? (
            <div className="grid max-w-xs gap-1.5">
              <Label htmlFor="preview-month">Mês</Label>
              <Select
                id="preview-month"
                value={selected.month}
                onChange={(e) => setMonth(e.target.value)}
              >
                {previews.data.map((p) => (
                  <option key={p.month} value={p.month} className="capitalize">
                    {monthLabel(p.month)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Preview preview={selected} />
        </>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono font-semibold', tone === 'warning' && 'text-warning')}>
        {value}
      </dd>
    </div>
  );
}

function Preview({ preview }: { preview: MyPayrollPreview }) {
  const { item } = preview;
  return (
    <article className="space-y-5 rounded-2xl border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold capitalize">{monthLabel(preview.month)}</h2>
        <PayrollStatusBadge status={preview.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        {item.position ?? 'Sem cargo'} · {item.unit} · contado até {formatDate(preview.cutoffDate)}
      </p>

      <section aria-labelledby="salario">
        <h3 id="salario" className="text-lg font-bold">
          Salário
        </h3>
        <dl className="divide-y text-sm">
          <Row label="Salário base do cargo" value={formatBRL(item.baseSalary)} />
        </dl>
      </section>

      <section aria-labelledby="jornada">
        <h3 id="jornada" className="text-lg font-bold">
          Jornada
        </h3>
        <dl className="divide-y text-sm">
          <Row label="Horas previstas" value={formatMinutes(item.plannedMinutes)} />
          <Row label="Horas trabalhadas" value={formatMinutes(item.workedMinutes)} />
          <Row
            label="Saldo do mês"
            value={formatSignedMinutes(item.balanceMinutes)}
            {...(item.balanceMinutes < 0 ? { tone: 'warning' as const } : {})}
          />
          <Row
            label="Faltas"
            value={`${String(item.absenceDays)} dia(s)`}
            {...(item.absenceDays > 0 ? { tone: 'warning' as const } : {})}
          />
          <Row label="Dias com atestado" value={`${String(item.justifiedDays)} dia(s)`} />
          {item.incompleteDays > 0 ? (
            <Row
              label="Dias com marcação faltando"
              value={`${String(item.incompleteDays)} dia(s)`}
              tone="warning"
            />
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="beneficios-mes">
        <h3 id="beneficios-mes" className="text-lg font-bold">
          Benefícios
        </h3>
        {item.benefits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum benefício no mês.</p>
        ) : (
          <dl className="divide-y text-sm">
            {item.benefits.map((b) => (
              <Row
                key={b.name}
                label={`${b.name} (${BENEFIT_KIND_LABELS[b.kind]}) · desconto`}
                value={formatBRL(b.employeeDiscount)}
              />
            ))}
            <Row
              label="Total de descontos de benefícios"
              value={formatBRL(item.benefitsDiscountTotal)}
            />
          </dl>
        )}
      </section>

      {item.incompleteDays > 0 || item.absenceDays > 0 ? (
        <Alert variant="warning">
          Algo não confere? Peça o ajuste no espelho de ponto ou fale com o RH antes do fechamento.
        </Alert>
      ) : null}
    </article>
  );
}
