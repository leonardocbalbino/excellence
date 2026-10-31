import {
  type CycleAnchor,
  MAX_CYCLE_DAYS,
  PARITY_LABELS,
  parityInMonth,
  type Shift,
  type Unit,
  type WorkSchedule,
  type WorkScheduleInput,
  workScheduleInputSchema,
} from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, MinusIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
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
import { unitsQueryKey } from '../organization/query-keys';
import { shiftsQueryKey, workSchedulesQueryKey } from './query-keys';

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function isParity(anchor: CycleAnchor | null | undefined): anchor is 'odd' | 'even' {
  return anchor === 'odd' || anchor === 'even';
}

/** AAAA-MM do mês atual somado a `offset` meses. */
function monthFromNow(offset = 0): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Modelos de escala: escolhido o modelo e o turno, os dias do ciclo saem prontos (e podem
 * ser ajustados depois). "Personalizado" monta o ciclo dia a dia.
 */
type ScheduleModel = 'odd' | 'even' | '12x36' | '5x2' | '6x1' | 'custom' | 'flexible';

const MODELS: { value: ScheduleModel; label: string }[] = [
  { value: 'odd', label: '12x36 nos dias ímpares' },
  { value: 'even', label: '12x36 nos dias pares' },
  { value: '12x36', label: '12x36 com início definido em cada funcionário' },
  { value: '5x2', label: '5x2: segunda a sexta, folga sábado e domingo' },
  { value: '6x1', label: '6x1: segunda a sábado, folga domingo' },
  { value: 'custom', label: 'Personalizado (montar os dias do ciclo)' },
  { value: 'flexible', label: 'Flexível (só carga horária semanal)' },
];

const DEFAULT_MODEL: ScheduleModel = 'odd';

type GeneratedFields = Pick<WorkScheduleInput, 'kind' | 'cycleAnchor' | 'parityMonth' | 'days'>;

function generate(
  model: ScheduleModel,
  shift: string | null,
  parityMonth: string | null,
): GeneratedFields {
  switch (model) {
    case 'odd':
    case 'even':
      return {
        kind: 'cycle',
        cycleAnchor: model,
        parityMonth: parityMonth ?? monthFromNow(),
        days: [shift, null],
      };
    case '12x36':
      return { kind: 'cycle', cycleAnchor: 'assignment', parityMonth: null, days: [shift, null] };
    case '5x2':
    case '6x1': {
      const work = model === '5x2' ? 5 : 6;
      return {
        kind: 'cycle',
        cycleAnchor: 'monday',
        parityMonth: null,
        days: Array.from({ length: 7 }, (_, i) => (i < work ? shift : null)),
      };
    }
    case 'flexible':
      return { kind: 'flexible', cycleAnchor: null, parityMonth: null, days: [] };
    case 'custom':
      return { kind: 'cycle', cycleAnchor: 'assignment', parityMonth: null, days: [shift, null] };
  }
}

/** Reconhece o modelo de uma escala salva (o que não bate com nenhum vira personalizado). */
function detectModel(schedule: WorkSchedule | undefined): ScheduleModel {
  if (!schedule) return DEFAULT_MODEL;
  if (schedule.kind === 'flexible') return 'flexible';
  if (isParity(schedule.cycleAnchor)) return schedule.cycleAnchor;
  const shift = schedule.days.find((d) => d !== null) ?? null;
  const same = (model: ScheduleModel) =>
    JSON.stringify(generate(model, shift, null).days) === JSON.stringify(schedule.days);
  if (schedule.cycleAnchor === 'assignment' && same('12x36')) return '12x36';
  if (schedule.cycleAnchor === 'monday' && same('5x2')) return '5x2';
  if (schedule.cycleAnchor === 'monday' && same('6x1')) return '6x1';
  return 'custom';
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
  });
}

/** Pasta do posto de onde a pessoa veio (`?posto=`): a nova escala nasce nele. */
function folderOf(unitId: string | null): string {
  return unitId ? `/cadastros/postos/${unitId}?aba=escalas` : '/jornada/escalas';
}

export function WorkScheduleEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const posto = params.get('posto');
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
  const units = useQuery({
    queryKey: [...unitsQueryKey, { includeInactive: true }],
    queryFn: () => api.units.list(true),
  });
  const loading = shifts.isPending || units.isPending || (id !== undefined && schedule.isPending);
  const backUnit = posto ?? schedule.data?.unit?.id ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to={folderOf(posto)}>
          <ArrowLeftIcon />
          {posto ? 'Pasta do posto' : 'Escalas'}
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
          {loading || !shifts.data || !units.data ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <ScheduleForm
              key={schedule.data?.id ?? 'nova'}
              schedule={schedule.data}
              shifts={shifts.data}
              units={units.data}
              initialUnitId={posto}
              back={folderOf(backUnit)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleForm({
  schedule,
  shifts: allShifts,
  units,
  initialUnitId,
  back,
}: {
  schedule: WorkSchedule | undefined;
  shifts: Shift[];
  units: Unit[];
  initialUnitId: string | null;
  back: string;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan('schedules:manage');
  // Escala de posto usa turnos gerais ou do mesmo posto; escala geral, só turnos gerais.
  const unitIdAtStart = schedule ? (schedule.unit?.id ?? null) : initialUnitId;
  const firstShift =
    allShifts.find((s) => s.isActive && (s.unit === null || s.unit.id === unitIdAtStart))?.id ??
    null;
  const [model, setModel] = useState<ScheduleModel>(() => detectModel(schedule));
  const [shiftId, setShiftId] = useState<string | null>(
    () => schedule?.days.find((d) => d !== null) ?? firstShift,
  );
  const [values, setValues] = useState<WorkScheduleInput>(() =>
    schedule
      ? {
          unitId: unitIdAtStart,
          name: schedule.name,
          code: schedule.code,
          kind: schedule.kind,
          cycleAnchor: schedule.cycleAnchor,
          parityMonth: schedule.parityMonth,
          days: schedule.days,
          weeklyMinutes: schedule.weeklyMinutes,
          notes: schedule.notes,
          isActive: schedule.isActive,
        }
      : {
          unitId: unitIdAtStart,
          name: '',
          code: null,
          ...generate(DEFAULT_MODEL, firstShift, null),
          weeklyMinutes: null,
          notes: null,
          isActive: true,
        },
  );
  const shifts = allShifts.filter((s) => s.unit === null || s.unit.id === values.unitId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof WorkScheduleInput>(key: K, value: WorkScheduleInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setDay = (index: number, id: string | null) =>
    set(
      'days',
      values.days.map((d, i) => (i === index ? id : d)),
    );

  /** Trocar o modelo ou o turno gera os dias de novo (o ajuste manual recomeça). */
  const choose = (next: ScheduleModel, nextShift: string | null) => {
    setModel(next);
    setShiftId(nextShift);
    if (next === 'custom') {
      // Personalizado parte do que já está montado.
      setValues((v) => ({
        ...v,
        kind: 'cycle',
        cycleAnchor: v.cycleAnchor === 'monday' ? 'monday' : 'assignment',
        parityMonth: null,
        days: v.days.length > 0 ? v.days : [nextShift, null],
      }));
      return;
    }
    setValues((v) => ({ ...v, ...generate(next, nextShift, v.parityMonth ?? null) }));
  };
  const parity = isParity(values.cycleAnchor) ? values.cycleAnchor : null;
  const adjusted =
    model !== 'custom' &&
    model !== 'flexible' &&
    JSON.stringify(values.days) !== JSON.stringify(generate(model, shiftId, null).days);

  const dayLabel = (index: number) =>
    parity
      ? index === 0
        ? `Dias ${PARITY_LABELS[parity]}`
        : 'Dia seguinte'
      : values.cycleAnchor === 'monday'
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
      if (!schedule) {
        const query = initialUnitId ? `?posto=${initialUnitId}` : '';
        void navigate(`/jornada/escalas/${saved.id}${query}`, { replace: true });
      }
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
      void navigate(back, { replace: true });
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
          <Label htmlFor="schedule-unit">Posto de trabalho</Label>
          <Select
            id="schedule-unit"
            value={values.unitId ?? ''}
            onChange={(e) => set('unitId', e.target.value || null)}
          >
            <option value="">Geral (qualquer posto)</option>
            {units
              .filter((u) => u.isActive || u.id === values.unitId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Select>
          {fieldError('unitId')}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="schedule-code">Código</Label>
          <Input
            id="schedule-code"
            value={values.code ?? ''}
            onChange={(e) => set('code', e.target.value || null)}
          />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="schedule-model">Modelo da escala</Label>
          <Select
            id="schedule-model"
            value={model}
            onChange={(e) => choose(e.target.value as ScheduleModel, shiftId)}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          {fieldError('cycleAnchor')}
        </div>
        {model === 'custom' ? (
          <div className="grid gap-2">
            <Label htmlFor="schedule-anchor">O ciclo começa</Label>
            <Select
              id="schedule-anchor"
              value={values.cycleAnchor === 'monday' ? 'monday' : 'assignment'}
              onChange={(e) => set('cycleAnchor', e.target.value as CycleAnchor)}
            >
              <option value="monday">Na segunda-feira (folga em dia fixo)</option>
              <option value="assignment">No dia definido para cada funcionário (rodízio)</option>
            </Select>
          </div>
        ) : null}
        {model !== 'custom' && model !== 'flexible' ? (
          <div className="grid gap-2">
            <Label htmlFor="schedule-shift">Turno</Label>
            <Select
              id="schedule-shift"
              value={shiftId ?? ''}
              onChange={(e) => choose(model, e.target.value || null)}
            >
              <option value="">Escolha o turno…</option>
              {shifts
                .filter((s) => s.isActive || s.id === shiftId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start}–{s.end})
                  </option>
                ))}
            </Select>
          </div>
        ) : null}
        {model === 'flexible' ? (
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
        ) : null}
      </fieldset>

      {values.kind === 'cycle' && parity ? (
        <fieldset disabled={!canManage} className="grid gap-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Par ou ímpar</legend>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="schedule-parity-month">
              Mês em que trabalha nos dias {PARITY_LABELS[parity]}
            </Label>
            <Input
              id="schedule-parity-month"
              type="month"
              value={values.parityMonth ?? ''}
              onChange={(e) => set('parityMonth', e.target.value || null)}
            />
            {fieldError('parityMonth')}
          </div>
          <p className="text-sm text-muted-foreground">
            Trabalha um dia e folga o outro até o fim do mês. Depois de um mês com 31 dias (ou de
            fevereiro com 29), quem estava nos ímpares passa para os pares e vice-versa.
          </p>
          {values.parityMonth ? (
            <ul className="flex flex-wrap gap-2" aria-label="Paridade nos próximos meses">
              {Array.from({ length: 6 }, (_, i) => monthFromNow(i)).map((month) => (
                <li key={month} className="rounded-md border bg-muted px-2.5 py-1 text-sm">
                  <span className="capitalize">{monthLabel(month)}</span>:{' '}
                  <strong>
                    {PARITY_LABELS[parityInMonth(parity, values.parityMonth ?? month, month)]}
                  </strong>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
      ) : null}

      {values.kind === 'cycle' ? (
        <fieldset disabled={!canManage} className="grid gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Dias do ciclo</legend>
          {model === 'custom' ? null : (
            <p className="text-sm text-muted-foreground">
              Gerado pelo modelo:{' '}
              <strong className="text-foreground">
                {values.days
                  .map((d, i) => `${dayLabel(i)}: ${d ? (shiftOf(d)?.name ?? 'turno') : 'folga'}`)
                  .join(' · ')}
              </strong>
              {adjusted ? ' (ajustado)' : ''}
            </p>
          )}
          <details className="group grid gap-3" open={model === 'custom' || adjusted}>
            {model === 'custom' ? null : (
              <summary className="cursor-pointer text-sm font-semibold text-primary">
                Ajustar dias (remanejo)
              </summary>
            )}
            <ol className="mt-3 grid gap-2">
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
          </details>
          <div className="flex flex-wrap items-center gap-2">
            {model !== 'custom' ? null : (
              <>
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
              </>
            )}
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
