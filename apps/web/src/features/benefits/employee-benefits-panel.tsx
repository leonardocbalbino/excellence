import { BENEFIT_KIND_LABELS, type EmployeeBenefit } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GiftIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { benefitsQueryKey, employeeBenefitsQueryKey } from './labels';

/** Benefícios do funcionário (quem tem `benefits:manage`): vigentes, encerrados e novos. */
export function EmployeeBenefitsPanel({ employeeId }: { employeeId: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = [...employeeBenefitsQueryKey, employeeId];
  const assigned = useQuery({ queryKey: key, queryFn: () => api.benefits.ofEmployee(employeeId) });
  const catalog = useQuery({
    queryKey: [...benefitsQueryKey, { includeInactive: false }],
    queryFn: () => api.benefits.list(false),
  });
  const [benefitId, setBenefitId] = useState('');
  const [companyValue, setCompanyValue] = useState('');
  const [discount, setDiscount] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const assign = useMutation({
    mutationFn: () =>
      api.benefits.assign(employeeId, {
        benefitId,
        companyValue: numberOrNull(companyValue) ?? 0,
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
            {assigned.data?.map((item) => (
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
                    Empresa {formatBRL(item.companyValue)} · desconto{' '}
                    {formatBRL(item.employeeDiscount)} · desde {formatDate(item.startDate)}
                    {item.endDate ? ` até ${formatDate(item.endDate)}` : ''}
                  </span>
                </span>
                <Badge variant={item.active ? 'soft' : 'outline'}>
                  {item.active ? 'Vigente' : 'Encerrado'}
                </Badge>
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
              </li>
            ))}
          </ul>
        )}

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
                const chosen = catalog.data?.find((b) => b.id === e.target.value);
                setCompanyValue(
                  chosen && chosen.defaultCompanyValue !== null
                    ? String(chosen.defaultCompanyValue).replace('.', ',')
                    : '',
                );
                setDiscount(
                  chosen && chosen.defaultEmployeeDiscount !== null
                    ? String(chosen.defaultEmployeeDiscount).replace('.', ',')
                    : '',
                );
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
            <Label htmlFor="benefit-start">A partir de</Label>
            <Input
              id="benefit-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="benefit-value">Valor pago pela empresa (R$/mês)</Label>
            <Input
              id="benefit-value"
              inputMode="decimal"
              value={companyValue}
              onChange={(e) => setCompanyValue(e.target.value)}
            />
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
