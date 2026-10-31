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
import { NewInUnitButton } from '../organization/new-in-unit';
import { unitFolderPath } from '../organization/unit-folder-path';
import { unitsQueryKey } from '../organization/query-keys';
import { patrolPointsQueryKey } from './labels';

export function PatrolPointsPage() {
  return <PatrolPointsCatalog />;
}

/**
 * Pontos de ronda: cada um vira um QR code afixado no local. Com `unitId` (pasta do posto),
 * cadastra os pontos do posto; sem, é a visão consolidada e o cadastro abre a pasta.
 */
export function PatrolPointsCatalog({ unitId }: { unitId?: string }) {
  const api = useApi();
  const units = useQuery({
    queryKey: [...unitsQueryKey, 'options'],
    queryFn: () => api.units.list(),
  });
  return (
    <CatalogPage<PatrolPoint>
      config={{
        title: 'Pontos de ronda',
        description: unitId
          ? 'Locais do posto que o vigilante precisa visitar. Imprima o QR code e afixe no local.'
          : 'Pontos de todos os postos. Para cadastrar ou editar, abra a pasta do posto.',
        singular: 'ponto',
        embedded: unitId !== undefined,
        ready: units.isSuccess,
        ...(unitId
          ? {}
          : {
              createAction: () => <NewInUnitButton label="Novo ponto" tab="rondas" />,
              editLink: (p: PatrolPoint) => unitFolderPath(p.unit.id, 'rondas'),
            }),
        managePermission: 'patrols:manage',
        schema: patrolPointInputSchema,
        actions: (
          <Button asChild variant="outline">
            <Link to={`/gestao/rondas/pontos/imprimir${unitId ? `?posto=${unitId}` : ''}`}>
              <PrinterIcon />
              Imprimir QR codes
            </Link>
          </Button>
        ),
        fields: [
          { name: 'name', label: 'Nome', kind: 'text' },
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
          ...(unitId ? [] : [{ header: 'Posto', cell: (p: PatrolPoint) => p.unit.name }]),
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
          unitId: p?.unit.id ?? unitId ?? '',
          description: p?.description ?? null,
          latitude: p?.latitude ?? null,
          longitude: p?.longitude ?? null,
          radiusMeters: p?.radiusMeters ?? null,
          isActive: p?.isActive ?? true,
        }),
        queryKey: unitId ? [...patrolPointsQueryKey, 'unit', unitId] : patrolPointsQueryKey,
        list: async (includeInactive) => {
          const points = await api.patrolPoints.list(includeInactive);
          return unitId ? points.filter((p) => p.unit.id === unitId) : points;
        },
        create: (values) => api.patrolPoints.create(values as PatrolPointInput),
        update: (id, values) => api.patrolPoints.update(id, values as PatrolPointInput),
        remove: (id) => api.patrolPoints.remove(id),
      }}
    />
  );
}
