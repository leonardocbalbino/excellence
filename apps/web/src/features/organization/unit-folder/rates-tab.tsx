import { type ScheduleRate, scheduleRateInputSchema } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatBRL, todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { workSchedulesQueryKey } from '../../scheduling/query-keys';
import { formatMonth, nextMonth } from './months';

const ratesQueryKey = ['schedule-rates'] as const;

/** Valor vigente no mês: o de vigência mais recente que já começou. */
function currentRates(rates: readonly ScheduleRate[], month: string): Set<string> {
  const best = new Map<string, ScheduleRate>();
  for (const rate of rates) {
    if (rate.validFrom > month) continue;
    const current = best.get(rate.scheduleId);
    if (!current || rate.validFrom > current.validFrom) best.set(rate.scheduleId, rate);
  }
  return new Set([...best.values()].map((rate) => rate.id));
}

/**
 * Valor por plantão de cada escala do posto. Um valor novo "a partir de" um mês é o
 * reajuste: vale sozinho na virada, e os meses anteriores continuam com o valor antigo.
 */
export function UnitRatesTab({ unitId }: { unitId: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const thisMonth = todayIso().slice(0, 7);
  const rates = useQuery({
    queryKey: [...ratesQueryKey, unitId],
    queryFn: () => api.payroll.rates(unitId),
  });
  const schedules = useQuery({
    queryKey: [...workSchedulesQueryKey, 'options', unitId],
    queryFn: () => api.workSchedules.list(false, unitId),
  });
  const [scheduleId, setScheduleId] = useState('');
  const [validFrom, setValidFrom] = useState(nextMonth(thisMonth));
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [...ratesQueryKey, unitId] });
  const save = useMutation({
    mutationFn: (input: { scheduleId: string; validFrom: string; amount: number }) =>
      api.payroll.saveRate(unitId, input),
    onSuccess: async () => {
      toast.success('Valor salvo.');
      setAmount('');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (rateId: string) => api.payroll.removeRate(unitId, rateId),
    onSuccess: async () => {
      toast.success('Valor excluído.');
      await refresh();
    },
  });

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setFormError(null);
    const parsed = scheduleRateInputSchema.safeParse({
      scheduleId,
      validFrom,
      amount: Number(amount.replace(/\./g, '').replace(',', '.')),
    });
    if (!parsed.success || amount.trim() === '') {
      setFormError(
        !scheduleId
          ? 'Escolha a escala.'
          : (parsed.error?.issues[0]?.message ?? 'Informe o valor por plantão.'),
      );
      return;
    }
    save.mutate(parsed.data);
  };

  const current = currentRates(rates.data ?? [], thisMonth);
  const error = save.error ?? remove.error;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo valor por plantão</CardTitle>
          <CardDescription>
            O valor vale a partir do mês escolhido, até o próximo valor cadastrado. Para reajustar,
            cadastre o novo valor a partir do mês do reajuste: ele entra sozinho na virada do mês.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schedules.data?.length === 0 ? (
            <Alert>
              O posto ainda não tem escalas.{' '}
              <Link
                to={`/cadastros/postos/${unitId}?aba=escalas`}
                className="text-primary hover:underline"
              >
                Cadastre as escalas
              </Link>{' '}
              antes dos valores.
            </Alert>
          ) : (
            <form
              className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
              noValidate
              onSubmit={submit}
            >
              <div className="grid gap-2">
                <Label htmlFor="rate-schedule">Escala</Label>
                <Select
                  id="rate-schedule"
                  value={scheduleId}
                  onChange={(e) => setScheduleId(e.target.value)}
                  disabled={schedules.isPending}
                >
                  <option value="">Escolha…</option>
                  {schedules.data?.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rate-from">A partir de</Label>
                <Input
                  id="rate-from"
                  type="month"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rate-amount">Valor por plantão (R$)</Label>
                <Input
                  id="rate-amount"
                  inputMode="decimal"
                  placeholder="180,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Spinner /> : <PlusIcon />}
                Salvar
              </Button>
            </form>
          )}
          {formError ? <p className="mt-3 text-sm text-destructive">{formError}</p> : null}
        </CardContent>
      </Card>

      {rates.isError ? <Alert variant="destructive">{errorMessage(rates.error)}</Alert> : null}
      {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Escala</TableHead>
              <TableHead>A partir de</TableHead>
              <TableHead className="text-right">Valor por plantão</TableHead>
              <TableHead className="sr-only">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.isPending ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : rates.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum valor cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              rates.data?.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell className="font-medium">{rate.scheduleName}</TableCell>
                  <TableCell>
                    {formatMonth(rate.validFrom)}
                    {current.has(rate.id) ? (
                      <Badge className="ml-2">Vigente</Badge>
                    ) : rate.validFrom > thisMonth ? (
                      <Badge variant="outline" className="ml-2">
                        Programado
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBRL(rate.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir valor de ${rate.scheduleName} a partir de ${formatMonth(rate.validFrom)}`}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm('Excluir este valor?')) remove.mutate(rate.id);
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
