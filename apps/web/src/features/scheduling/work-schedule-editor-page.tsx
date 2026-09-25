import {
  MAX_CYCLE_DAYS,
  type Shift,
  type WorkSchedule,
  type WorkScheduleInput,
  workScheduleInputSchema,
} from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, MinusIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatMinutes } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { shiftsQueryKey, workSchedulesQueryKey } from './query-keys';

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export function WorkScheduleEditorPage() {
  const { id } = useParams();
  const api = useApi();
  const schedule = useQuery({
    queryKey: [...workSchedulesQueryKey, id],
    queryFn: () => api.workSchedules.get(id ?? ''),
    enabled: id !== undefined,
  });
  // Todos os turnos (inclusive inativos) para exibir escalas antigas sem perder o valor.
  const shifts = useQuery({
    queryKey: [...shiftsQueryKey, 'all'],
    queryFn: () => api.shifts.list(true),
  });
  const loading = shifts.isPending || (id !== undefined && schedule.isPending);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/jornada/escalas">
          <ArrowLeftIcon />
          Escalas
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold">
        {id ? (schedule.data?.name ?? 'Escala') : 'Nova escala'}
      </h1>
      {schedule.isError || shifts.isError ? (
        <Alert variant="destructive">{errorMessage(schedule.error ?? shifts.error)}</Alert>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          {loading || !shifts.data ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <ScheduleForm
              key={schedule.data?.id ?? 'nova'}
              schedule={schedule.data}
              shifts={shifts.data}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleForm({
  schedule,
  shifts,
}: {
  schedule: WorkSchedule | undefined;
  shifts: Shift[];
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan('schedules:manage');
  const [values, setValues] = useState<WorkScheduleInput>({
    name: schedule?.name ?? '',
    code: schedule?.code ?? null,
    kind: schedule?.kind ?? 'cycle',
    cycleAnchor: schedule?.cycleAnchor ?? 'monday',
    days: schedule?.days ?? [null, null, null, null, null, null, null],
    weeklyMinutes: schedule?.weeklyMinutes ?? null,
    notes: schedule?.notes ?? null,
    isActive: schedule?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [presetShift, setPresetShift] = useState(shifts.find((s) => s.isActive)?.id ?? '');

  const set = <K extends keyof WorkScheduleInput>(key: K, value: WorkScheduleInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setDay = (index: number, shiftId: string | null) =>
    set(
      'days',
      values.days.map((d, i) => (i === index ? shiftId : d)),
    );

  /** Atalhos para os ciclos mais comuns, usando o turno escolhido. */
  const applyPreset = (preset: '5x2' | '6x1' | '12x36') => {
    const shift = presetShift || null;
    if (preset === '12x36') {
      setValues((v) => ({ ...v, cycleAnchor: 'assignment', days: [shift, null] }));
    } else {
      const work = preset === '5x2' ? 5 : 6;
      setValues((v) => ({
        ...v,
        cycleAnchor: 'monday',
        days: Array.from({ length: 7 }, (_, i) => (i < work ? shift : null)),
      }));
    }
  };

  const dayLabel = (index: number) =>
    values.cycleAnchor === 'monday'
      ? `${WEEKDAYS[index % 7] ?? ''}${values.days.length > 7 ? ` (semana ${Math.floor(index / 7) + 1})` : ''}`
      : `Dia ${index + 1}`;
  const shiftOf = (id: string | null) => shifts.find((s) => s.id === id);
  const cycleWork = values.days.reduce((sum, d) => sum + (shiftOf(d)?.workMinutes ?? 0), 0);

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setSubmitError(null);
    const parsed = workScheduleInputSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = schedule
        ? await api.workSchedules.update(schedule.id, values)
        : await api.workSchedules.create(values);
      await queryClient.invalidateQueries({ queryKey: workSchedulesQueryKey });
      toast.success('Escala salva.');
      if (!schedule) void navigate(`/jornada/escalas/${saved.id}`, { replace: true });
    } catch (error) {
      setSubmitError(error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!schedule || !window.confirm(`Excluir a escala "${schedule.name}"?`)) return;
    try {
      await api.workSchedules.remove(schedule.id);
      await queryClient.invalidateQueries({ queryKey: workSchedulesQueryKey });
      toast.success('Escala excluída.');
      void navigate('/jornada/escalas', { replace: true });
    } catch (error) {
      setSubmitError(error);
    }
  };

  const fieldError = (name: string) =>
    errors[name] ? <p className="text-sm text-destructive">{errors[name]}</p> : null;

  return (
    <form className="grid gap-6" noValidate onSubmit={(e) => void submit(e)}>
      <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="schedule-name">Nome</Label>
          <Input
            id="schedule-name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
          {fieldError('name')}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="schedule-code">Código</Label>
          <Input
            id="schedule-code"
            value={values.code ?? ''}
            onChange={(e) => set('code', e.target.value || null)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="schedule-kind">Tipo</Label>
          <Select
            id="schedule-kind"
            value={values.kind}
            onChange={(e) => set('kind', e.target.value as WorkScheduleInput['kind'])}
          >
            <option value="cycle">Ciclo de dias com turnos</option>
            <option value="flexible">Flexível (só carga horária)</option>
          </Select>
        </div>
        {values.kind === 'cycle' ? (
          <div className="grid gap-2">
            <Label htmlFor="schedule-anchor">O ciclo começa</Label>
            <Select
              id="schedule-anchor"
              value={values.cycleAnchor ?? 'monday'}
              onChange={(e) => set('cycleAnchor', e.target.value as 'monday' | 'assignment')}
            >
              <option value="monday">Na segunda-feira (folga em dia fixo)</option>
              <option value="assignment">
                No dia definido para cada funcionário (12x36, rodízio)
              </option>
            </Select>
            {fieldError('cycleAnchor')}
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="schedule-weekly">Carga semanal (horas)</Label>
            <Input
              id="schedule-weekly"
              inputMode="decimal"
              value={values.weeklyMinutes === null ? '' : String(values.weeklyMinutes / 60)}
              onChange={(e) => {
                const hours = Number(e.target.value.replace(',', '.'));
                set(
                  'weeklyMinutes',
                  e.target.value === '' || Number.isNaN(hours) ? null : Math.round(hours * 60),
                );
              }}
            />
            {fieldError('weeklyMinutes')}
          </div>
        )}
      </fieldset>

      {values.kind === 'cycle' ? (
        <fieldset disabled={!canManage} className="grid gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Dias do ciclo</legend>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-2">
              <Label htmlFor="preset-shift">Preencher com o turno</Label>
              <Select
                id="preset-shift"
                value={presetShift}
                onChange={(e) => setPresetShift(e.target.value)}
              >
                {shifts
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.start}–{s.end})
                    </option>
                  ))}
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('5x2')}>
              5x2
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('6x1')}>
              6x1
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('12x36')}>
              12x36
            </Button>
          </div>
          <ol className="grid gap-2">
            {values.days.map((shiftId, index) => (
              <li key={index} className="grid grid-cols-[9rem_1fr] items-center gap-3">
                <Label htmlFor={`day-${index}`}>{dayLabel(index)}</Label>
                <Select
                  id={`day-${index}`}
                  value={shiftId ?? ''}
                  onChange={(e) => setDay(index, e.target.value || null)}
                >
                  <option value="">Folga</option>
                  {shifts
                    .filter((s) => s.isActive || s.id === shiftId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.start}–{s.end})
                      </option>
                    ))}
                </Select>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={values.days.length >= MAX_CYCLE_DAYS}
              onClick={() => set('days', [...values.days, null])}
            >
              <PlusIcon />
              Dia
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={values.days.length <= 1}
              onClick={() => set('days', values.days.slice(0, -1))}
            >
              <MinusIcon />
              Dia
            </Button>
            <span className="text-sm text-muted-foreground">
              {values.days.length} dias · {formatMinutes(cycleWork)} de trabalho previstos no ciclo
            </span>
          </div>
          {fieldError('days')}
        </fieldset>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="schedule-notes">Observações</Label>
        <Input
          id="schedule-notes"
          disabled={!canManage}
          value={values.notes ?? ''}
          onChange={(e) => set('notes', e.target.value || null)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="schedule-active"
          disabled={!canManage}
          checked={values.isActive ?? true}
          onCheckedChange={(checked) => set('isActive', checked === true)}
        />
        <Label htmlFor="schedule-active">Escala ativa</Label>
      </div>

      {submitError ? <Alert variant="destructive">{errorMessage(submitError)}</Alert> : null}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner /> : null}
            Salvar escala
          </Button>
          {schedule ? (
            <Button type="button" variant="outline" onClick={() => void remove()}>
              <Trash2Icon />
              Excluir
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
