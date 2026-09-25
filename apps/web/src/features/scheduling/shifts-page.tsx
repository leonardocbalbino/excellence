import { type Shift, shiftInputSchema } from '@excellence/shared';
import type { z } from 'zod';
import { formatMinutes } from '@/lib/format';
import { useApi } from '@/lib/services';
import { CatalogPage } from '../organization/catalog-page';
import { shiftsQueryKey } from './query-keys';

type ShiftInput = z.input<typeof shiftInputSchema>;

export function ShiftsPage() {
  const api = useApi();
  return (
    <CatalogPage<Shift>
      config={{
        title: 'Turnos',
        description: 'Horários de trabalho usados para montar as escalas.',
        singular: 'turno',
        managePermission: 'schedules:manage',
        queryKey: shiftsQueryKey,
        schema: shiftInputSchema,
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
          {
            header: 'Horário',
            cell: (s) => `${s.start} às ${s.end}${s.crossesMidnight ? ' (+1 dia)' : ''}`,
          },
          { header: 'Intervalo', cell: (s) => formatMinutes(s.breakMinutes) },
          { header: 'Trabalho', cell: (s) => formatMinutes(s.workMinutes) },
        ],
        defaults: (s) => ({
          name: s?.name ?? '',
          code: s?.code ?? null,
          start: s?.start ?? '08:00',
          end: s?.end ?? '17:00',
          breakMinutes: s?.breakMinutes ?? 60,
          isActive: s?.isActive ?? true,
        }),
        list: (includeInactive) => api.shifts.list(includeInactive),
        create: (values) => api.shifts.create(values as ShiftInput),
        update: (id, values) => api.shifts.update(id, values as ShiftInput),
        remove: (id) => api.shifts.remove(id),
      }}
    />
  );
}
