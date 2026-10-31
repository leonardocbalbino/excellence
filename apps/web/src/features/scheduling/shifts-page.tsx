import { type Shift, shiftInputSchema } from '@excellence/shared';
import type { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { formatMinutes } from '@/lib/format';
import { useApi } from '@/lib/services';
import { CatalogPage } from '../organization/catalog-page';
import { NewInUnitButton } from '../organization/new-in-unit';
import { unitFolderPath } from '../organization/unit-folder-path';
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
 * nasce no posto. Sem posto (menu Jornada), é a visão consolidada: os turnos de posto se
 * cadastram e editam na pasta; aqui, só os gerais.
 */
export function ShiftsCatalog({ unitId }: { unitId?: string }) {
  const api = useApi();
  return (
    <CatalogPage<Shift>
      config={{
        title: 'Turnos',
        description: unitId
          ? 'Horários de trabalho do posto (e os gerais da empresa), usados nas escalas.'
          : 'Horários de trabalho de todos os postos. Os de posto se cadastram na pasta dele; aqui, os gerais da empresa.',
        singular: 'turno',
        managePermission: 'schedules:manage',
        queryKey: unitId ? [...shiftsQueryKey, 'unit', unitId] : shiftsQueryKey,
        schema: shiftInputSchema,
        embedded: unitId !== undefined,
        ...(unitId
          ? {}
          : {
              createAction: (openNew: () => void) => (
                <NewInUnitButton label="Novo turno" tab="escalas" onGeneral={openNew} />
              ),
              editLink: (s: Shift) => (s.unit ? unitFolderPath(s.unit.id, 'escalas') : null),
            }),
        fields: [
          { name: 'name', label: 'Nome', kind: 'text' },
          { name: 'code', label: 'Código', kind: 'text', optional: true },
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
