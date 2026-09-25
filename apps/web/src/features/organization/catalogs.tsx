import {
  type Department,
  departmentInputSchema,
  formatCnpj,
  type LaborUnion,
  laborUnionInputSchema,
  type Position,
  positionInputSchema,
} from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { useApi } from '@/lib/services';
import { CatalogPage } from './catalog-page';
import {
  departmentsQueryKey,
  positionsQueryKey,
  unionsQueryKey,
  unitsQueryKey,
} from './query-keys';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function DepartmentsPage() {
  const api = useApi();
  const units = useQuery({
    queryKey: [...unitsQueryKey, 'options'],
    queryFn: () => api.units.list(),
  });
  const unitName = (id: string | null) => units.data?.find((u) => u.id === id)?.name;
  return (
    <CatalogPage<Department>
      config={{
        title: 'Departamentos',
        description: 'Áreas da empresa, gerais ou de uma unidade específica.',
        singular: 'departamento',
        ready: units.isSuccess,
        managePermission: 'departments:manage',
        queryKey: departmentsQueryKey,
        schema: departmentInputSchema,
        fields: [
          { name: 'name', label: 'Nome', kind: 'text' },
          { name: 'code', label: 'Código', kind: 'text', optional: true },
          {
            name: 'unitId',
            label: 'Unidade',
            kind: 'select',
            optional: true,
            hint: 'Vazio = vale para todas as unidades.',
            options: units.data?.map((u) => ({ value: u.id, label: u.name })) ?? [],
          },
        ],
        columns: [
          { header: 'Código', cell: (d) => d.code ?? '—' },
          { header: 'Unidade', cell: (d) => unitName(d.unitId) ?? 'Todas' },
        ],
        defaults: (d) => ({
          name: d?.name ?? '',
          code: d?.code ?? null,
          unitId: d?.unitId ?? null,
          isActive: d?.isActive ?? true,
        }),
        list: (includeInactive) => api.departments.list(includeInactive),
        create: (values) => api.departments.create(values as z.input<typeof departmentInputSchema>),
        update: (id, values) =>
          api.departments.update(id, values as z.input<typeof departmentInputSchema>),
        remove: (id) => api.departments.remove(id),
      }}
    />
  );
}

export function PositionsPage() {
  const api = useApi();
  return (
    <CatalogPage<Position>
      config={{
        title: 'Cargos',
        description: 'Cargos e funções, com o código CBO quando houver.',
        singular: 'cargo',
        managePermission: 'positions:manage',
        queryKey: positionsQueryKey,
        schema: positionInputSchema,
        fields: [
          { name: 'name', label: 'Nome', kind: 'text' },
          {
            name: 'cbo',
            label: 'CBO',
            kind: 'text',
            optional: true,
            hint: 'Classificação Brasileira de Ocupações (6 dígitos).',
          },
        ],
        columns: [{ header: 'CBO', cell: (p) => p.cbo ?? '—' }],
        defaults: (p) => ({
          name: p?.name ?? '',
          cbo: p?.cbo ?? null,
          isActive: p?.isActive ?? true,
        }),
        list: (includeInactive) => api.positions.list(includeInactive),
        create: (values) => api.positions.create(values as z.input<typeof positionInputSchema>),
        update: (id, values) =>
          api.positions.update(id, values as z.input<typeof positionInputSchema>),
        remove: (id) => api.positions.remove(id),
      }}
    />
  );
}

export function UnionsPage() {
  const api = useApi();
  return (
    <CatalogPage<LaborUnion>
      config={{
        title: 'Sindicatos',
        description: 'Entidades sindicais das categorias. As convenções ficam na base normativa.',
        singular: 'sindicato',
        managePermission: 'unions:manage',
        queryKey: unionsQueryKey,
        schema: laborUnionInputSchema,
        fields: [
          { name: 'name', label: 'Nome', kind: 'text' },
          { name: 'cnpj', label: 'CNPJ', kind: 'text', optional: true },
          {
            name: 'baseMonth',
            label: 'Mês da data-base',
            kind: 'select',
            optional: true,
            options: MONTHS.map((month, i) => ({ value: String(i + 1), label: month })),
          },
        ],
        columns: [
          { header: 'CNPJ', cell: (u) => (u.cnpj ? formatCnpj(u.cnpj) : '—') },
          { header: 'Data-base', cell: (u) => (u.baseMonth ? MONTHS[u.baseMonth - 1] : '—') },
        ],
        defaults: (u) => ({
          name: u?.name ?? '',
          cnpj: u?.cnpj ? formatCnpj(u.cnpj) : null,
          baseMonth: u?.baseMonth ?? null,
          isActive: u?.isActive ?? true,
        }),
        list: (includeInactive) => api.unions.list(includeInactive),
        create: (values) => api.unions.create(toUnion(values)),
        update: (id, values) => api.unions.update(id, toUnion(values)),
        remove: (id) => api.unions.remove(id),
      }}
    />
  );
}

/** O select devolve texto; o mês vai como número. */
function toUnion(values: Record<string, unknown>): z.input<typeof laborUnionInputSchema> {
  const baseMonth = values.baseMonth;
  return {
    ...(values as z.input<typeof laborUnionInputSchema>),
    baseMonth: baseMonth === null || baseMonth === undefined ? null : Number(baseMonth),
  };
}
