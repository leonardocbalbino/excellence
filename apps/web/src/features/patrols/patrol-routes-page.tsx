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
import { patrolRoutesQueryKey, weekdaysText } from './labels';

/** Rotas de ronda: pontos em ordem, horários e quem faz. */
export function PatrolRoutesPage() {
  const api = useApi();
  const [includeInactive, setIncludeInactive] = useState(false);
  const routes = useQuery({
    queryKey: [...patrolRoutesQueryKey, { includeInactive }],
    queryFn: () => api.patrolRoutes.list(includeInactive),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rotas de ronda</h1>
          <p className="text-muted-foreground">
            A sequência de pontos, o tempo previsto, os horários e os vigilantes de cada rota.
          </p>
        </div>
        <Button asChild>
          <Link to="/gestao/rondas/rotas/nova">
            <PlusIcon />
            Nova rota
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="routes-inactive"
          checked={includeInactive}
          onCheckedChange={(checked) => setIncludeInactive(checked === true)}
        />
        <Label htmlFor="routes-inactive">Mostrar inativas</Label>
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
                      to={`/gestao/rondas/rotas/${route.id}`}
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
