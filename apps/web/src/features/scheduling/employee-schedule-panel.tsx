import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDaysIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { addDaysIso, formatDate, todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { PlannedDays } from './planned-days';
import { assignmentsQueryKey, plannedQueryKey, workSchedulesQueryKey } from './query-keys';

/** Escala do funcionário: histórico de vínculos, novo vínculo e as próximas duas semanas. */
export function EmployeeSchedulePanel({ employeeId }: { employeeId: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const canAssign = useCan('schedules:assign');
  const today = todayIso();
  const [startDate, setStartDate] = useState(today);
  const [scheduleId, setScheduleId] = useState('');
  const [cycleStartDate, setCycleStartDate] = useState('');

  const assignments = useQuery({
    queryKey: [...assignmentsQueryKey, employeeId],
    queryFn: () => api.schedule.assignments(employeeId),
  });
  const planned = useQuery({
    queryKey: [...plannedQueryKey, employeeId, today],
    queryFn: () => api.schedule.planned(employeeId, today, addDaysIso(today, 13)),
  });
  const schedules = useQuery({
    queryKey: [...workSchedulesQueryKey, 'options'],
    queryFn: () => api.workSchedules.list(),
    enabled: canAssign,
  });
  const selected = schedules.data?.find((s) => s.id === scheduleId);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [...assignmentsQueryKey, employeeId] });
    await queryClient.invalidateQueries({ queryKey: [...plannedQueryKey, employeeId] });
  };
  const assign = useMutation({
    mutationFn: () =>
      api.schedule.assign(employeeId, {
        scheduleId,
        startDate,
        cycleStartDate: cycleStartDate || null,
      }),
    onSuccess: async () => {
      await refresh();
      toast.success('Escala vinculada.');
    },
  });
  const unassign = useMutation({
    mutationFn: (assignmentId: string) => api.schedule.unassign(employeeId, assignmentId),
    onSuccess: async () => {
      await refresh();
      toast.success('Vínculo removido.');
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDaysIcon className="size-4" aria-hidden="true" />
          Escala de trabalho
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {assignments.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : assignments.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma escala vinculada.</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {assignments.data?.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{a.scheduleName}</strong> — de {formatDate(a.startDate)}
                  {a.endDate ? ` até ${formatDate(a.endDate)}` : ' em diante'}
                </span>
                {canAssign && a.startDate > today ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover vínculo com ${a.scheduleName}`}
                    onClick={() => unassign.mutate(a.id)}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {unassign.isError ? (
          <Alert variant="destructive">{errorMessage(unassign.error)}</Alert>
        ) : null}

        {canAssign ? (
          <form
            className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              assign.mutate();
            }}
          >
            <p className="text-sm font-medium sm:col-span-3">
              Nova escala (a atual é encerrada na véspera)
            </p>
            <div className="grid gap-2">
              <Label htmlFor="assign-schedule">Escala</Label>
              <Select
                id="assign-schedule"
                value={scheduleId}
                onChange={(e) => setScheduleId(e.target.value)}
              >
                <option value="">Selecione</option>
                {schedules.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assign-start">A partir de</Label>
              <Input
                id="assign-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {selected?.cycleAnchor === 'assignment' ? (
              <div className="grid gap-2">
                <Label htmlFor="assign-cycle">1º dia do ciclo</Label>
                <Input
                  id="assign-cycle"
                  type="date"
                  value={cycleStartDate}
                  onChange={(e) => setCycleStartDate(e.target.value)}
                />
              </div>
            ) : null}
            {assign.isError ? (
              <Alert variant="destructive" className="sm:col-span-3">
                {errorMessage(assign.error)}
              </Alert>
            ) : null}
            <div className="sm:col-span-3">
              <Button type="submit" disabled={!scheduleId || !startDate || assign.isPending}>
                {assign.isPending ? <Spinner /> : null}
                Vincular escala
              </Button>
            </div>
          </form>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Próximos 14 dias</h3>
          {planned.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : planned.data ? (
            <PlannedDays days={planned.data} today={today} />
          ) : (
            <Alert variant="destructive">{errorMessage(planned.error)}</Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
