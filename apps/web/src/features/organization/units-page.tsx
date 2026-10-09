import { useQuery } from '@tanstack/react-query';
import { MapPinIcon, PlusIcon } from 'lucide-react';
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
import { useCan } from '../access/access';
import { unitsQueryKey } from './query-keys';

export function UnitsPage() {
  const api = useApi();
  const canManage = useCan('units:manage');
  const [includeInactive, setIncludeInactive] = useState(false);
  const units = useQuery({
    queryKey: [...unitsQueryKey, { includeInactive }],
    queryFn: () => api.units.list(includeInactive),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Postos de trabalho</h1>
          <p className="text-muted-foreground">Locais de trabalho, com endereço e cerca virtual.</p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link to="/cadastros/postos/novo">
              <PlusIcon />
              Novo posto
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="include-inactive"
          checked={includeInactive}
          onCheckedChange={(checked) => setIncludeInactive(checked === true)}
        />
        <Label htmlFor="include-inactive">Mostrar inativas</Label>
      </div>
      {units.isError ? <Alert variant="destructive">{errorMessage(units.error)}</Alert> : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Posto</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Cerca virtual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.isPending ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : units.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Nenhum posto de trabalho cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              units.data?.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell>
                    <Link
                      to={`/cadastros/postos/${unit.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {unit.name}
                    </Link>
                    <div className="mt-1 flex gap-1">
                      {unit.code ? <Badge variant="outline">{unit.code}</Badge> : null}
                      {unit.isActive ? null : <Badge variant="secondary">Inativa</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{unit.city ? `${unit.city}/${unit.state ?? ''}` : '—'}</TableCell>
                  <TableCell>
                    {unit.geofenceRadiusMeters ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon className="size-4 text-primary" aria-hidden="true" />
                        {unit.geofenceRadiusMeters} m
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sem cerca</span>
                    )}
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
