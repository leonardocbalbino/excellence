import {
  ApiError,
  type PatrolRoute,
  type PatrolRouteInput,
  patrolRouteInputSchema,
  WEEKDAY_LABELS,
} from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage, useApi } from '@/lib/services';
import { cn } from '@/lib/utils';
import { unitsQueryKey } from '../organization/query-keys';
import { employeesQueryKey } from '../workforce/query-keys';
import { patrolPointsQueryKey, patrolRoutesQueryKey } from './labels';

interface Named {
  id: string;
  name: string;
}

interface Draft {
  unitId: string;
  name: string;
  description: string;
  expectedMinutes: string;
  enforceOrder: boolean;
  isActive: boolean;
  points: Named[];
  startTimes: string[];
  weekdays: number[];
  assignees: Named[];
}

function toDraft(route: PatrolRoute | undefined, defaultUnit: string): Draft {
  return {
    unitId: route?.unit.id ?? defaultUnit,
    name: route?.name ?? '',
    description: route?.description ?? '',
    expectedMinutes: String(route?.expectedMinutes ?? 30),
    enforceOrder: route?.enforceOrder ?? false,
    isActive: route?.isActive ?? true,
    points: route?.points ?? [],
    startTimes: route?.startTimes ?? [],
    weekdays: route?.weekdays ?? [1, 2, 3, 4, 5],
    assignees: route?.assignees ?? [],
  };
}

function toInput(draft: Draft): PatrolRouteInput {
  return {
    unitId: draft.unitId,
    name: draft.name,
    description: draft.description.trim() || null,
    expectedMinutes: Number(draft.expectedMinutes),
    enforceOrder: draft.enforceOrder,
    isActive: draft.isActive,
    pointIds: draft.points.map((p) => p.id),
    startTimes: [...draft.startTimes].sort(),
    weekdays: [...draft.weekdays].sort(),
    assigneeIds: draft.assignees.map((a) => a.id),
  };
}

/** Cadastro de rota (nova ou existente). */
export function PatrolRouteEditorPage() {
  const api = useApi();
  const { id } = useParams();
  const route = useQuery({
    queryKey: [...patrolRoutesQueryKey, id],
    queryFn: () => api.patrolRoutes.get(id ?? ''),
    enabled: Boolean(id),
  });
  const units = useQuery({
    queryKey: [...unitsQueryKey, 'options'],
    queryFn: () => api.units.list(),
  });

  if ((id && route.isPending) || units.isPending) return <Skeleton className="h-96 w-full" />;
  if (route.isError) return <Alert variant="destructive">{errorMessage(route.error)}</Alert>;
  return <RouteForm key={route.data?.id ?? 'new'} route={route.data} units={units.data ?? []} />;
}

function RouteForm({ route, units }: { route: PatrolRoute | undefined; units: Named[] }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => toDraft(route, units[0]?.id ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [time, setTime] = useState('');
  const [search, setSearch] = useState('');
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const points = useQuery({
    queryKey: [...patrolPointsQueryKey, { includeInactive: false }],
    queryFn: () => api.patrolPoints.list(false),
  });
  const available = (points.data ?? []).filter(
    (p) => p.unit.id === draft.unitId && !draft.points.some((d) => d.id === p.id),
  );
  const term = search.trim();
  const employees = useQuery({
    queryKey: [...employeesQueryKey, 'patrol-search', term],
    queryFn: () => api.employees.list({ search: term, status: 'active', pageSize: 8 }),
    enabled: term.length >= 2,
  });

  const save = useMutation({
    mutationFn: (input: PatrolRouteInput) =>
      route ? api.patrolRoutes.update(route.id, input) : api.patrolRoutes.create(input),
    onSuccess: async (saved) => {
      toast.success('Rota salva.');
      await queryClient.invalidateQueries({ queryKey: patrolRoutesQueryKey });
      if (!route) void navigate(`/gestao/rondas/rotas/${saved.id}`, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.patrolRoutes.remove(route?.id ?? ''),
    onSuccess: async () => {
      toast.success('Rota excluída.');
      await queryClient.invalidateQueries({ queryKey: patrolRoutesQueryKey });
      void navigate('/gestao/rondas/rotas');
    },
  });

  const submit = () => {
    const input = toInput(draft);
    const parsed = patrolRouteInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(input);
  };

  const move = (index: number, delta: number) => {
    const next = [...draft.points];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    set({ points: next });
  };
  const addTime = () => {
    if (!/^\d{2}:\d{2}$/.test(time) || draft.startTimes.includes(time)) return;
    set({ startTimes: [...draft.startTimes, time].sort() });
    setTime('');
  };
  const fieldError = (name: string) =>
    errors[name] ? (
      <p className="text-sm text-destructive" role="alert">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form
      className="mx-auto max-w-3xl space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div>
        <Link
          to="/gestao/rondas/rotas"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          Rotas de ronda
        </Link>
        <h1 className="text-3xl font-bold">{route ? route.name : 'Nova rota'}</h1>
      </div>

      <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="route-name">Nome</Label>
          <Input
            id="route-name"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            aria-invalid={Boolean(errors.name)}
          />
          {fieldError('name')}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="route-unit">Posto de trabalho</Label>
          <Select
            id="route-unit"
            value={draft.unitId}
            onChange={(e) => set({ unitId: e.target.value, points: [] })}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          {fieldError('unitId')}
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="route-description">Descrição</Label>
          <Textarea
            id="route-description"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="route-minutes">Tempo previsto (minutos)</Label>
          <Input
            id="route-minutes"
            inputMode="numeric"
            value={draft.expectedMinutes}
            onChange={(e) => set({ expectedMinutes: e.target.value })}
            aria-invalid={Boolean(errors.expectedMinutes)}
          />
          {fieldError('expectedMinutes')}
          <p className="text-xs text-muted-foreground">Passou disso, a ronda aparece atrasada.</p>
        </div>
        <div className="grid content-start gap-3 pt-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="route-order"
              checked={draft.enforceOrder}
              onCheckedChange={(c) => set({ enforceOrder: c === true })}
            />
            <Label htmlFor="route-order">Exigir os pontos na ordem</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="route-active"
              checked={draft.isActive}
              onCheckedChange={(c) => set({ isActive: c === true })}
            />
            <Label htmlFor="route-active">Rota ativa</Label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="route-points">
        <h2 id="route-points" className="text-xl font-bold">
          Pontos, em ordem
        </h2>
        {fieldError('pointIds')}
        {draft.points.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum ponto na rota ainda.</p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {draft.points.map((point, index) => (
              <li key={point.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <span className="w-6 text-muted-foreground">{index + 1}.</span>
                <span className="flex-1 font-medium">{point.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Subir ${point.name}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Descer ${point.name}`}
                  disabled={index === draft.points.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Tirar ${point.name} da rota`}
                  onClick={() => set({ points: draft.points.filter((p) => p.id !== point.id) })}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-3 grid gap-1.5">
          <Label htmlFor="route-add-point">Adicionar ponto</Label>
          <Select
            id="route-add-point"
            value=""
            disabled={available.length === 0}
            onChange={(e) => {
              const point = available.find((p) => p.id === e.target.value);
              if (point) set({ points: [...draft.points, { id: point.id, name: point.name }] });
            }}
          >
            <option value="">
              {available.length === 0 ? 'Nenhum outro ponto ativo neste posto' : 'Escolha…'}
            </option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="route-times">
        <h2 id="route-times" className="text-xl font-bold">
          Horários de início
        </h2>
        <p className="text-sm text-muted-foreground">
          No fuso do posto. Sem horários, a rota pode ser feita a qualquer momento.
        </p>
        {fieldError('startTimes')}
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Horários">
          {draft.startTimes.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => set({ startTimes: draft.startTimes.filter((s) => s !== t) })}
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 font-mono text-sm font-semibold text-primary"
                aria-label={`Remover horário ${t}`}
              >
                {t}
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="route-time">Novo horário</Label>
            <Input
              id="route-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-36"
            />
          </div>
          <Button type="button" variant="outline" onClick={addTime} disabled={!time}>
            <PlusIcon />
            Adicionar
          </Button>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Dias da semana</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, day) => {
              const on = draft.weekdays.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set({
                      weekdays: on
                        ? draft.weekdays.filter((d) => d !== day)
                        : [...draft.weekdays, day],
                    })
                  }
                  className={cn(
                    'w-14 rounded-lg border py-1.5 text-sm font-semibold',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {fieldError('weekdays')}
        </fieldset>
      </section>

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="route-assignees">
        <h2 id="route-assignees" className="text-xl font-bold">
          Vigilantes da rota
        </h2>
        <p className="text-sm text-muted-foreground">
          Só quem está aqui vê a rota e consegue iniciar a ronda.
        </p>
        {fieldError('assigneeIds')}
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Vigilantes">
          {draft.assignees.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => set({ assignees: draft.assignees.filter((x) => x.id !== a.id) })}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium"
                aria-label={`Tirar ${a.name} da rota`}
              >
                {a.name}
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-1.5">
          <Label htmlFor="route-employee-search">Adicionar vigilante</Label>
          <Input
            id="route-employee-search"
            type="search"
            placeholder="Nome, matrícula ou CPF"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {term.length >= 2 ? (
          <ul className="mt-2 grid gap-1">
            {employees.isPending ? (
              <li>
                <Skeleton className="h-8 w-full" />
              </li>
            ) : (
              employees.data?.items
                .filter((e) => !draft.assignees.some((a) => a.id === e.id))
                .map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        set({
                          assignees: [
                            ...draft.assignees,
                            { id: e.id, name: e.socialName ?? e.name },
                          ],
                        });
                        setSearch('');
                      }}
                    >
                      <span>
                        {e.socialName ?? e.name}{' '}
                        <span className="text-muted-foreground">· {e.unit.name}</span>
                      </span>
                      <PlusIcon className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))
            )}
          </ul>
        ) : null}
      </section>

      {save.isError ? <Alert variant="destructive">{errorMessage(save.error)}</Alert> : null}
      {remove.isError ? <Alert variant="destructive">{errorMessage(remove.error)}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          Salvar rota
        </Button>
        {route ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Excluir a rota "${route.name}"?`)) remove.mutate();
            }}
          >
            <Trash2Icon />
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  );
}
