import type { AdjustmentInput } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { AdjustmentForm, type DisregardTarget } from './adjustment-form';
import { ADJUSTMENT_STATUS, currentMonth, monthLabel, shiftMonth } from './labels';
import { adjustmentsQueryKey, timesheetQueryKey } from './query-keys';
import { TimesheetTable } from './timesheet-table';

export function MyTimesheetPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState<'none' | 'include' | DisregardTarget>('none');
  const timesheet = useQuery({
    queryKey: [...timesheetQueryKey, 'me', month],
    queryFn: () => api.time.myTimesheet(month),
  });
  const adjustments = useQuery({
    queryKey: [...adjustmentsQueryKey, 'me'],
    queryFn: () => api.adjustments.mine(),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: timesheetQueryKey });
    await queryClient.invalidateQueries({ queryKey: adjustmentsQueryKey });
  };
  const request = async (input: AdjustmentInput) => {
    await api.adjustments.request(input);
    await refresh();
    toast.success('Pedido de ajuste enviado ao seu gestor.');
    setForm('none');
  };
  const cancel = useMutation({
    mutationFn: (id: string) => api.adjustments.cancel(id),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meu ponto</h1>
        <p className="text-muted-foreground">
          Clique numa marcação para pedir que seja desconsiderada.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Mês anterior"
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-40 text-center font-medium capitalize">{monthLabel(month)}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Próximo mês"
        >
          <ChevronRightIcon />
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => setForm('include')}>
          <PlusIcon />
          Incluir marcação
        </Button>
      </div>

      {form !== 'none' ? (
        <AdjustmentForm
          key={form === 'include' ? 'include' : form.id}
          target={form === 'include' ? null : form}
          defaultDate={todayIso()}
          onSubmit={request}
          onCancel={() => setForm('none')}
        />
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {timesheet.isPending ? (
            <Skeleton className="h-96 w-full" />
          ) : timesheet.data ? (
            <TimesheetTable timesheet={timesheet.data} onSelectEntry={(entry) => setForm(entry)} />
          ) : (
            <Alert variant="destructive">{errorMessage(timesheet.error)}</Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meus pedidos de ajuste</CardTitle>
        </CardHeader>
        <CardContent>
          {adjustments.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {adjustments.data?.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"
                >
                  <span>
                    {a.type === 'include'
                      ? `Incluir ${a.proposedLocal ?? ''}`
                      : `Desconsiderar ${a.targetEntry ? `${a.targetEntry.localDate} ${a.targetEntry.localTime}` : ''}`}
                    <span className="text-muted-foreground"> — {a.reason}</span>
                    {a.decisionNote ? (
                      <span className="block text-muted-foreground">
                        Resposta: {a.decisionNote}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={a.status === 'approved' ? 'default' : 'secondary'}>
                      {ADJUSTMENT_STATUS[a.status]}
                    </Badge>
                    {a.status === 'pending' ? (
                      <Button variant="ghost" size="sm" onClick={() => cancel.mutate(a.id)}>
                        Cancelar
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
