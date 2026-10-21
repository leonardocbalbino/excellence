import {
  BENEFIT_KIND_LABELS,
  type DailyBenefitLine,
  type EmployeeBenefit,
  isDailyCalculation,
} from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GiftIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { addDaysIso, formatBRL, formatDate, todayIso } from '@/lib/format';
import { numberOrNull } from '@/lib/form-values';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { benefitDaysQueryKey } from '../payroll/labels';
import { currentMonth, monthLabel } from '../time-tracking/labels';
import { benefitsQueryKey, employeeBenefitsQueryKey } from './labels';

/** Valor para o campo de texto (vírgula decimal); sem valor, vazio. */
function fieldText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

/** "15 dias × R$ 20,00 = R$ 300,00" do mês, calculado pelo ponto. */
function MonthTotal({ line, month }: { line: DailyBenefitLine; month: string }) {
  return (
    <span className="block text-xs font-medium text-primary">
      Em {monthLabel(month)}: {line.days} {line.days === 1 ? 'dia' : 'dias'} ×{' '}
      {formatBRL(line.dailyValue)} = {formatBRL(line.total)}
      {line.adjustment ? ' (ajustado)' : ''}
    </span>
  );
}

/** Corrige valor, desconto ou início de uma atribuição. */
function EditAssignment({
  employeeId,
  item,
  onDone,
}: {
  employeeId: string;
  item: EmployeeBenefit;
  onDone: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const daily = isDailyCalculation(item.benefit.calculation);
  const [value, setValue] = useState(fieldText(daily ? item.dailyValue : item.companyValue));
  const [discount, setDiscount] = useState(fieldText(item.employeeDiscount));
  const [startDate, setStartDate] = useState(item.startDate);
  const save = useMutation({
    mutationFn: () =>
      api.benefits.updateAssignment(employeeId, item.id, {
        benefitId: item.benefit.id,
        ...(daily
          ? { dailyValue: numberOrNull(value) }
          : { companyValue: numberOrNull(value) ?? 0 }),
        employeeDiscount: numberOrNull(discount) ?? 0,
        startDate,
        endDate: item.endDate,
        notes: item.notes,
      }),
    onSuccess: async () => {
      toast.success(`${item.benefit.name} atualizado.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...employeeBenefitsQueryKey, employeeId] }),
        queryClient.invalidateQueries({ queryKey: benefitDaysQueryKey }),
      ]);
      onDone();
    },
  });
  const id = `edit-${item.id}`;

  return (
    <form
      className="grid w-full gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3"
      aria-label={`Editar ${item.benefit.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-value`}>
          {daily ? 'Valor por dia trabalhado (R$/dia)' : 'Valor pago pela empresa (R$/mês)'}
        </Label>
        <Input
          id={`${id}-value`}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-discount`}>Desconto do funcionário (R$/mês)</Label>
        <Input
          id={`${id}-discount`}
          inputMode="decimal"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-start`}>Vale a partir de</Label>
        <Input
          id={`${id}-start`}
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-3">
        O novo valor vale para todo o período da atribuição, inclusive meses ainda não fechados na
        Folha. Para um reajuste só daqui para a frente, encerre este e atribua de novo com a nova
        data.
      </p>
      <div className="flex flex-wrap gap-2 sm:col-span-3">
        <Button type="submit" size="sm" disabled={!value || save.isPending}>
          {save.isPending ? <Spinner /> : null}
          Salvar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
      {save.error ? (
        <Alert variant="destructive" className="sm:col-span-3">
          {errorMessage(save.error)}
        </Alert>
      ) : null}
    </form>
  );
}

/** Benefícios do funcionário (quem tem `benefits:manage`): vigentes, encerrados e novos. */
export function EmployeeBenefitsPanel({ employeeId }: { employeeId: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const canSeeMonth = useCan('payroll:manage');
  const key = [...employeeBenefitsQueryKey, employeeId];
  const assigned = useQuery({ queryKey: key, queryFn: () => api.benefits.ofEmployee(employeeId) });
  const catalog = useQuery({
    queryKey: [...benefitsQueryKey, { includeInactive: false }],
    queryFn: () => api.benefits.list(false),
  });
  const month = currentMonth();
  const hasDaily = assigned.data?.some((item) => item.dailyValue !== null) ?? false;
  // VA/VT do mês atual, pelo ponto (mesmo cálculo da tela de VA/VT e da Folha).
  const monthDays = useQuery({
    queryKey: [...benefitDaysQueryKey, month, employeeId],
    queryFn: () => api.payroll.benefitDays(month, employeeId),
    enabled: canSeeMonth && hasDaily,
  });
  const monthRow = monthDays.data?.rows[0];
  const [benefitId, setBenefitId] = useState('');
  const [companyValue, setCompanyValue] = useState('');
  const [discount, setDiscount] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [editing, setEditing] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: benefitDaysQueryKey }),
    ]);
  const chosen = catalog.data?.find((b) => b.id === benefitId);
  // VA/VT por dia: informa-se o valor diário; o valor do mês sai do ponto.
  const daily = chosen ? isDailyCalculation(chosen.calculation) : false;
  const dailyPreview = daily ? numberOrNull(companyValue) : null;

  const assign = useMutation({
    mutationFn: () =>
      api.benefits.assign(employeeId, {
        benefitId,
        ...(daily
          ? { dailyValue: numberOrNull(companyValue) }
          : { companyValue: numberOrNull(companyValue) ?? 0 }),
        employeeDiscount: numberOrNull(discount) ?? 0,
        startDate,
      }),
    onSuccess: async () => {
      toast.success('Benefício atribuído.');
      setBenefitId('');
      setCompanyValue('');
      setDiscount('');
      await refresh();
    },
  });
  /** Encerra ontem (o benefício deixa de valer hoje). */
  const end = useMutation({
    mutationFn: (item: EmployeeBenefit) =>
      api.benefits.updateAssignment(employeeId, item.id, {
        benefitId: item.benefit.id,
        companyValue: item.companyValue,
        dailyValue: item.dailyValue,
        employeeDiscount: item.employeeDiscount,
        startDate: item.startDate,
        endDate:
          addDaysIso(todayIso(), -1) < item.startDate ? item.startDate : addDaysIso(todayIso(), -1),
        notes: item.notes,
      }),
    onSuccess: async () => {
      toast.success('Benefício encerrado.');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.benefits.removeAssignment(employeeId, id),
    onSuccess: async () => {
      toast.success('Atribuição excluída.');
      await refresh();
    },
  });
  const error = assign.error ?? end.error ?? remove.error;

  /** Linha do mês (VA ou VT) para a atribuição vigente de benefício por dia. */
  const monthLine = (item: EmployeeBenefit): DailyBenefitLine | null => {
    if (!item.active || item.dailyValue === null) return null;
    if (item.benefit.kind !== 'food' && item.benefit.kind !== 'transport') return null;
    return monthRow?.[item.benefit.kind] ?? null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GiftIcon className="size-4" aria-hidden="true" />
          Benefícios
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {assigned.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : assigned.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum benefício atribuído.</p>
        ) : (
          <ul className="grid gap-2">
            {assigned.data?.map((item) => {
              const line = monthLine(item);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{item.benefit.name}</span>{' '}
                    <span className="text-muted-foreground">
                      · {BENEFIT_KIND_LABELS[item.benefit.kind]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {item.dailyValue !== null
                        ? `${formatBRL(item.dailyValue)}/dia trabalhado`
                        : `Empresa ${formatBRL(item.companyValue)}/mês`}{' '}
                      · desconto {formatBRL(item.employeeDiscount)} · vale desde{' '}
                      {formatDate(item.startDate)}
                      {item.endDate ? ` até ${formatDate(item.endDate)}` : ''}
                    </span>
                    {line ? <MonthTotal line={line} month={month} /> : null}
                  </span>
                  <Badge variant={item.active ? 'soft' : 'outline'}>
                    {item.active ? 'Vigente' : 'Encerrado'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Editar ${item.benefit.name}`}
                    onClick={() => setEditing(editing === item.id ? null : item.id)}
                  >
                    <PencilIcon />
                    Editar
                  </Button>
                  {item.active && !item.endDate ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={end.isPending}
                      onClick={() => {
                        if (window.confirm(`Encerrar ${item.benefit.name} a partir de hoje?`)) {
                          end.mutate(item);
                        }
                      }}
                    >
                      Encerrar
                    </Button>
                  ) : null}
                  {item.startDate > todayIso() ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${item.benefit.name}`}
                      onClick={() => remove.mutate(item.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  ) : null}
                  {editing === item.id ? (
                    <EditAssignment
                      employeeId={employeeId}
                      item={item}
                      onDone={() => setEditing(null)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {hasDaily ? (
          <p className="text-xs text-muted-foreground">
            VA e VT por dia: o total do mês é dias trabalhados no ponto × valor diário.{' '}
            {canSeeMonth
              ? 'Exceções do mês se ajustam em Remuneração › VA/VT.'
              : 'O RH confere e ajusta o mês em Remuneração › VA/VT.'}
          </p>
        ) : null}

        <form
          className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            assign.mutate();
          }}
        >
          <p className="text-sm font-semibold sm:col-span-2">Atribuir benefício</p>
          <div className="grid gap-1.5">
            <Label htmlFor="benefit-id">Benefício</Label>
            <Select
              id="benefit-id"
              value={benefitId}
              onChange={(e) => {
                setBenefitId(e.target.value);
                const next = catalog.data?.find((b) => b.id === e.target.value);
                const suggested =
                  next && isDailyCalculation(next.calculation)
                    ? next.defaultDailyValue
                    : next?.defaultCompanyValue;
                setCompanyValue(fieldText(suggested));
                setDiscount(fieldText(next?.defaultEmployeeDiscount));
              }}
            >
              <option value="">Escolha…</option>
              {catalog.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="benefit-start">Vale a partir de</Label>
            <Input
              id="benefit-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-describedby="benefit-start-hint"
            />
            <p id="benefit-start-hint" className="text-xs text-muted-foreground">
              Primeiro dia em que o benefício conta. Dias antes dessa data não entram no cálculo.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="benefit-value">
              {daily ? 'Valor por dia trabalhado (R$/dia)' : 'Valor pago pela empresa (R$/mês)'}
            </Label>
            <Input
              id="benefit-value"
              inputMode="decimal"
              value={companyValue}
              onChange={(e) => setCompanyValue(e.target.value)}
              aria-describedby={daily ? 'benefit-value-hint' : undefined}
            />
            {daily ? (
              <p id="benefit-value-hint" className="text-xs text-muted-foreground">
                O total do mês sai do ponto: dias trabalhados × este valor
                {dailyPreview !== null && !Number.isNaN(dailyPreview)
                  ? ` (ex.: 22 dias = ${formatBRL(dailyPreview * 22)})`
                  : ''}
                .
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="benefit-discount">Desconto do funcionário (R$/mês)</Label>
            <Input
              id="benefit-discount"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!benefitId || !companyValue || assign.isPending}>
              {assign.isPending ? <Spinner /> : <PlusIcon />}
              Atribuir
            </Button>
          </div>
        </form>
        {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
      </CardContent>
    </Card>
  );
}
