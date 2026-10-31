import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, useApi } from '@/lib/services';
import { ConsolidatedNote, NewInUnitButton } from '../organization/new-in-unit';
import { patrolRoutesQueryKey, weekdaysText } from './labels';

export function PatrolRoutesPage() {
  return <PatrolRoutesList />;
}

/**
 * Rotas de ronda: pontos em ordem, horários e quem faz. Com `unitId` (pasta do posto), as
 * rotas do posto; sem, a visão consolidada, e a nova rota começa escolhendo o posto.
 */
export function PatrolRoutesList({ unitId }: { unitId?: string }) {
  const api = useApi();
  const [includeInactive, setIncludeInactive] = useState(false);
  const routes = useQuery({
    queryKey: [...patrolRoutesQueryKey, { includeInactive }],
    queryFn: () => api.patrolRoutes.list(includeInactive),
    select: (list) => (unitId ? list.filter((r) => r.unit.id === unitId) : list),
  });
  const description =
    'A sequência de pontos, o tempo previsto, os horários e os vigilantes de cada rota.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {unitId ? (
            <h2 className="text-lg font-semibold">Rotas de ronda</h2>
          ) : (
            <h1 className="text-2xl font-semibold">Rotas de ronda</h1>
          )}
          <p className="text-muted-foreground">{description}</p>
        </div>
        {unitId ? (
          <Button asChild>
            <Link to={`/gestao/rondas/rotas/nova?posto=${unitId}`}>
              <PlusIcon />
              Nova rota
            </Link>
          </Button>
        ) : (
          <NewInUnitButton label="Nova rota" tab="rondas" />
        )}
      </div>
      {unitId ? null : <ConsolidatedNote what="rotas" />}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`routes-inactive${unitId ? '-unit' : ''}`}
          checked={includeInactive}
          onCheckedChange={(checked) => setIncludeInactive(checked === true)}
        />
        <Label htmlFor={`routes-inactive${unitId ? '-unit' : ''}`}>Mostrar inativas</Label>
      </div>
      {routes.isError ? <Alert variant="destructive">{errorMessage(routes.error)}</Alert> : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rota</TableHead>
              <TableHead>Posto</TableHead>
              <TableHead>Pontos</TableHead>
              <TableHead>Horários</TableHead>
              <TableHead>Dias</TableHead>
              <TableHead>Vigilantes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.isPending ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : routes.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhuma rota. Cadastre os pontos e depois crie a rota.
                </TableCell>
              </TableRow>
            ) : (
              routes.data?.map((route) => (
                <TableRow key={route.id}>
                  <TableCell>
                    <Link
                      to={`/gestao/rondas/rotas/${route.id}?posto=${route.unit.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {route.name}
                    </Link>
                    {route.isActive ? null : (
                      <Badge variant="outline" className="ml-2">
                        Inativa
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {route.expectedMinutes} min
                      {route.enforceOrder ? ' · ordem obrigatória' : ''}
                    </p>
                  </TableCell>
                  <TableCell>{route.unit.name}</TableCell>
                  <TableCell>{route.points.length}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {route.startTimes.length > 0 ? route.startTimes.join(' · ') : 'Livre'}
                  </TableCell>
                  <TableCell>{weekdaysText(route.weekdays)}</TableCell>
                  <TableCell>
                    {route.assignees.length > 0
                      ? route.assignees.map((a) => a.name).join(', ')
                      : '—'}
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
