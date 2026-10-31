import { PARITY_LABELS, parityInMonth, type WorkSchedule } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMinutes, todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { ConsolidatedNote, NewInUnitButton } from '../organization/new-in-unit';
import { workSchedulesQueryKey } from './query-keys';
import { OwnerBadge } from './shifts-page';

export function WorkSchedulesPage() {
  return <WorkSchedulesList />;
}

/**
 * Escalas. Com `unitId` (pasta do posto), lista as do posto e as gerais, e a nova escala já
 * nasce no posto.
 */
/** Tipo da escala; par/ímpar diz em quais dias cai neste mês. */
function scheduleKindText(schedule: WorkSchedule): string {
  if (schedule.kind === 'flexible') {
    return `Flexível · ${formatMinutes(schedule.weeklyMinutes ?? 0)} por semana`;
  }
  const anchor = schedule.cycleAnchor;
  if ((anchor === 'odd' || anchor === 'even') && schedule.parityMonth) {
    const parity = parityInMonth(anchor, schedule.parityMonth, todayIso().slice(0, 7));
    return `12x36 · este mês nos dias ${PARITY_LABELS[parity]}`;
  }
  const workDays = schedule.days.filter((d) => d !== null).length;
  return `Ciclo de ${schedule.days.length} dias · ${workDays} de trabalho`;
}

export function WorkSchedulesList({ unitId }: { unitId?: string }) {
  const api = useApi();
  const navigate = useNavigate();
  const canManage = useCan('schedules:manage');
  const schedules = useQuery({
    queryKey: [...workSchedulesQueryKey, 'all', unitId ?? 'company'],
    queryFn: () => api.workSchedules.list(true, unitId),
  });
  const query = unitId ? `?posto=${unitId}` : '';
  const description =
    'Sequência de dias de trabalho e folga que se repete (5x2, 6x1, 12x36…) ou carga flexível.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {unitId ? (
            <h2 className="text-lg font-semibold">Escalas</h2>
          ) : (
            <h1 className="text-2xl font-semibold">Escalas</h1>
          )}
          <p className="text-muted-foreground">
            {unitId ? `Escalas do posto e as gerais da empresa. ${description}` : description}
          </p>
        </div>
        {canManage && !unitId ? (
          <NewInUnitButton
            label="Nova escala"
            tab="escalas"
            onGeneral={() => void navigate('/jornada/escalas/nova')}
          />
        ) : null}
        {canManage && unitId ? (
          <Button asChild>
            <Link to={`/jornada/escalas/nova${query}`}>
              <PlusIcon />
              Nova escala
            </Link>
          </Button>
        ) : null}
      </div>
      {unitId ? null : <ConsolidatedNote what="escalas" />}
      {schedules.isError ? (
        <Alert variant="destructive">{errorMessage(schedules.error)}</Alert>
      ) : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Escala</TableHead>
              <TableHead>Posto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Funcionários</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.isPending ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : schedules.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhuma escala cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              schedules.data?.map((schedule) => {
                // Escala de posto abre com a pasta dele como volta.
                const owner = unitId ?? schedule.unit?.id;
                return (
                  <TableRow key={schedule.id}>
                    <TableCell>
                      <Link
                        to={`/jornada/escalas/${schedule.id}${owner ? `?posto=${owner}` : ''}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {schedule.name}
                      </Link>
                      {schedule.isActive ? null : (
                        <Badge variant="secondary" className="ml-2">
                          Inativa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <OwnerBadge unit={schedule.unit} />
                    </TableCell>
                    <TableCell>{scheduleKindText(schedule)}</TableCell>
                    <TableCell className="text-right">{schedule.employeeCount}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
