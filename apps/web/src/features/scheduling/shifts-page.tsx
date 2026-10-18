import { type Shift, shiftInputSchema } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { formatMinutes } from '@/lib/format';
import { useApi } from '@/lib/services';
import { CatalogPage } from '../organization/catalog-page';
import { unitsQueryKey } from '../organization/query-keys';
import { shiftsQueryKey } from './query-keys';

type ShiftInput = z.input<typeof shiftInputSchema>;

/** Posto dono do turno ou da escala; sem posto = cadastro geral da empresa. */
export function OwnerBadge({ unit }: { unit: { name: string } | null }) {
  return unit ? <span>{unit.name}</span> : <Badge variant="outline">Geral</Badge>;
}

export function ShiftsPage() {
  return <ShiftsCatalog />;
}

/**
 * Turnos. Com `unitId` (pasta do posto), lista os do posto e os gerais, e o novo turno já
 * nasce no posto.
 */
export function ShiftsCatalog({ unitId }: { unitId?: string }) {
  const api = useApi();
  const units = useQuery({
    queryKey: [...unitsQueryKey, { includeInactive: false }],
    queryFn: () => api.units.list(false),
    enabled: unitId === undefined,
  });
  const unitOptions = (units.data ?? []).map((unit) => ({ value: unit.id, label: unit.name }));
  return (
    <CatalogPage<Shift>
      config={{
        title: 'Turnos',
        description: unitId
          ? 'Horários de trabalho do posto (e os gerais da empresa), usados nas escalas.'
          : 'Horários de trabalho usados para montar as escalas.',
        singular: 'turno',
        managePermission: 'schedules:manage',
        queryKey: unitId ? [...shiftsQueryKey, 'unit', unitId] : shiftsQueryKey,
        schema: shiftInputSchema,
        embedded: unitId !== undefined,
        ready: unitId !== undefined || !units.isPending,
        fields: [
          { name: 'name', label: 'Nome', kind: 'text' },
          { name: 'code', label: 'Código', kind: 'text', optional: true },
          ...(unitId
            ? []
            : [
                {
                  name: 'unitId',
                  label: 'Posto de trabalho',
                  kind: 'select' as const,
                  optional: true,
                  options: unitOptions,
                  hint: 'Vazio = turno geral, usado em qualquer posto.',
                },
              ]),
          { name: 'start', label: 'Início', kind: 'time' },
          {
            name: 'end',
            label: 'Fim',
            kind: 'time',
            hint: 'Fim antes do início = termina no dia seguinte.',
          },
          {
            name: 'breakMinutes',
            label: 'Intervalo (minutos)',
            kind: 'number',
            hint: 'Tempo de intervalo dentro do turno, não trabalhado.',
          },
        ],
        columns: [
          { header: 'Posto', cell: (s) => <OwnerBadge unit={s.unit} /> },
          {
            header: 'Horário',
            cell: (s) => `${s.start} às ${s.end}${s.crossesMidnight ? ' (+1 dia)' : ''}`,
          },
          { header: 'Intervalo', cell: (s) => formatMinutes(s.breakMinutes) },
          { header: 'Trabalho', cell: (s) => formatMinutes(s.workMinutes) },
        ],
        defaults: (s) => ({
          // Editar mantém o dono; novo turno na pasta nasce no posto.
          unitId: s ? (s.unit?.id ?? null) : (unitId ?? null),
          name: s?.name ?? '',
          code: s?.code ?? null,
          start: s?.start ?? '08:00',
          end: s?.end ?? '17:00',
          breakMinutes: s?.breakMinutes ?? 60,
          isActive: s?.isActive ?? true,
        }),
        list: (includeInactive) => api.shifts.list(includeInactive, unitId),
        create: (values) => api.shifts.create(values as ShiftInput),
        update: (id, values) => api.shifts.update(id, values as ShiftInput),
        remove: (id) => api.shifts.remove(id),
      }}
    />
  );
}
