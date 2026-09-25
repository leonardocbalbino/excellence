import type { AdjustmentInput, ChainVerification } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { AdjustmentForm, type DisregardTarget } from './adjustment-form';
import { currentMonth, monthLabel, shiftMonth } from './labels';
import { adjustmentsQueryKey, timesheetQueryKey } from './query-keys';
import { TimesheetTable } from './timesheet-table';

/** Espelho de um funcionário (RH e gestores, dentro do escopo). */
export function EmployeeTimesheetPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const canRequest = useCan('time_entries:manage');
  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState<'none' | 'include' | DisregardTarget>('none');
  const timesheet = useQuery({
    queryKey: [...timesheetQueryKey, id, month],
    queryFn: () => api.time.timesheet(id, month),
  });
  const verification = useQuery({
    queryKey: ['time-entries-verification', id],
    queryFn: () => api.time.verify(id),
    enabled: false,
  });

  const request = async (input: AdjustmentInput) => {
    await api.adjustments.requestFor(id, input);
    await queryClient.invalidateQueries({ queryKey: timesheetQueryKey });
    await queryClient.invalidateQueries({ queryKey: adjustmentsQueryKey });
    toast.success('Pedido de ajuste registrado para aprovação.');
    setForm('none');
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to={`/pessoas/${id}`}>
          <ArrowLeftIcon />
          Cadastro do funcionário
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Espelho de ponto</h1>
        <p className="text-muted-foreground">
          {timesheet.data
            ? `${timesheet.data.employee.name} · matrícula ${timesheet.data.employee.registrationNumber}`
            : ''}
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
        {canRequest ? (
          <Button size="sm" className="ml-auto" onClick={() => setForm('include')}>
            <PlusIcon />
            Incluir marcação
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void verification.refetch()}>
          <ShieldCheckIcon />
          Conferir integridade
        </Button>
      </div>
      <VerificationResult data={verification.data} error={verification.error} />

      {form !== 'none' && canRequest ? (
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
            <TimesheetTable
              timesheet={timesheet.data}
              {...(canRequest ? { onSelectEntry: (entry: DisregardTarget) => setForm(entry) } : {})}
            />
          ) : (
            <Alert variant="destructive">{errorMessage(timesheet.error)}</Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VerificationResult({
  data,
  error,
}: {
  data: ChainVerification | undefined;
  error: unknown;
}) {
  if (error) return <Alert variant="destructive">{errorMessage(error)}</Alert>;
  if (!data) return null;
  const result = data;
  return result.valid ? (
    <Alert>
      Cadeia íntegra: {result.entries} marcações conferidas, nenhuma alteração detectada.
    </Alert>
  ) : (
    <Alert variant="destructive">
      Inconsistência na cadeia de marcações a partir do registro {result.brokenAtId}. Acione o
      suporte.
    </Alert>
  );
}
