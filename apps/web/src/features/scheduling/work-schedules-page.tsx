import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Link } from 'react-router';
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
import { formatMinutes } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { workSchedulesQueryKey } from './query-keys';

export function WorkSchedulesPage() {
  const api = useApi();
  const canManage = useCan('schedules:manage');
  const schedules = useQuery({
    queryKey: [...workSchedulesQueryKey, 'all'],
    queryFn: () => api.workSchedules.list(true),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Escalas</h1>
          <p className="text-muted-foreground">
            Sequência de dias de trabalho e folga que se repete (5x2, 6x1, 12x36…) ou carga
            flexível.
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link to="/jornada/escalas/nova">
              <PlusIcon />
              Nova escala
            </Link>
          </Button>
        ) : null}
      </div>
      {schedules.isError ? (
        <Alert variant="destructive">{errorMessage(schedules.error)}</Alert>
      ) : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Escala</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Funcionários</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.isPending ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : schedules.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Nenhuma escala cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              schedules.data?.map((schedule) => {
                const workDays = schedule.days.filter((d) => d !== null).length;
                return (
                  <TableRow key={schedule.id}>
                    <TableCell>
                      <Link
                        to={`/jornada/escalas/${schedule.id}`}
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
                      {schedule.kind === 'flexible'
                        ? `Flexível · ${formatMinutes(schedule.weeklyMinutes ?? 0)} por semana`
                        : `Ciclo de ${schedule.days.length} dias · ${workDays} de trabalho`}
                    </TableCell>
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
