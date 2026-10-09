import {
  type PatrolPoint,
  type PatrolPointInput,
  patrolPointInputSchema,
} from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { PrinterIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/services';
import { CatalogPage } from '../organization/catalog-page';
import { unitsQueryKey } from '../organization/query-keys';
import { patrolPointsQueryKey } from './labels';

/** Pontos de ronda: cada um vira um QR code afixado no local. */
export function PatrolPointsPage() {
  const api = useApi();
  const units = useQuery({
    queryKey: [...unitsQueryKey, 'options'],
    queryFn: () => api.units.list(),
  });
  return (
    <CatalogPage<PatrolPoint>
      config={{
        title: 'Pontos de ronda',
        description:
          'Locais que o vigilante precisa visitar. Imprima o QR code de cada um e afixe no local.',
        singular: 'ponto',
        ready: units.isSuccess,
        managePermission: 'patrols:manage',
        queryKey: patrolPointsQueryKey,
        schema: patrolPointInputSchema,
        actions: (
          <Button asChild variant="outline">
            <Link to="/gestao/rondas/pontos/imprimir">
              <PrinterIcon />
              Imprimir QR codes
            </Link>
          </Button>
        ),
        fields: [
          { name: 'name', label: 'Nome', kind: 'text' },
          {
            name: 'unitId',
            label: 'Posto de trabalho',
            kind: 'select',
            options: units.data?.map((u) => ({ value: u.id, label: u.name })) ?? [],
          },
          { name: 'description', label: 'Onde fica', kind: 'text', optional: true },
          {
            name: 'latitude',
            label: 'Latitude',
            kind: 'number',
            optional: true,
            hint: 'Opcional: para conferir se o check-in foi feito no local.',
          },
          { name: 'longitude', label: 'Longitude', kind: 'number', optional: true },
          {
            name: 'radiusMeters',
            label: 'Raio (metros)',
            kind: 'number',
            optional: true,
            hint: 'Distância aceita a partir da localização do ponto.',
          },
        ],
        columns: [
          { header: 'Posto', cell: (p) => p.unit.name },
          { header: 'Onde fica', cell: (p) => p.description ?? '—' },
          {
            header: 'QR code',
            cell: (p) => (
              <Link
                to={`/gestao/rondas/pontos/imprimir?ponto=${p.id}`}
                className="font-semibold text-primary underline"
              >
                Imprimir<span className="sr-only"> QR de {p.name}</span>
              </Link>
            ),
          },
        ],
        defaults: (p) => ({
          name: p?.name ?? '',
          unitId: p?.unit.id ?? units.data?.[0]?.id ?? '',
          description: p?.description ?? null,
          latitude: p?.latitude ?? null,
          longitude: p?.longitude ?? null,
          radiusMeters: p?.radiusMeters ?? null,
          isActive: p?.isActive ?? true,
        }),
        list: (includeInactive) => api.patrolPoints.list(includeInactive),
        create: (values) => api.patrolPoints.create(values as PatrolPointInput),
        update: (id, values) => api.patrolPoints.update(id, values as PatrolPointInput),
        remove: (id) => api.patrolPoints.remove(id),
      }}
    />
  );
}
