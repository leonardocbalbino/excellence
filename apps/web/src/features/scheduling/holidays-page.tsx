import { zodResolver } from '@hookform/resolvers/zod';
import {
  BRAZILIAN_STATES,
  type Holiday,
  type HolidayInput,
  holidayInputSchema,
  type HolidayScope,
} from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { applyFieldErrors } from '@/lib/form-errors';
import { emptyToNull } from '@/lib/form-values';
import { formatDate } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { unitsQueryKey } from '../organization/query-keys';
import { holidaysQueryKey } from './query-keys';

const SCOPE_LABELS: Record<HolidayScope, string> = {
  national: 'Nacional',
  state: 'Estadual',
  city: 'Municipal',
  company: 'Toda a empresa',
  unit: 'Uma unidade',
};

export function HolidaysPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const canManage = useCan('schedules:manage');
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<'none' | 'add' | 'suggest'>('none');
  const holidays = useQuery({
    queryKey: [...holidaysQueryKey, year],
    queryFn: () => api.holidays.list(year),
  });
  const units = useQuery({
    queryKey: [...unitsQueryKey, 'options'],
    queryFn: () => api.units.list(),
  });
  const unitName = (id: string | null) => units.data?.find((u) => u.id === id)?.name ?? '—';

  const remove = useMutation({
    mutationFn: (holiday: Holiday) => api.holidays.remove(holiday.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: holidaysQueryKey });
      toast.success('Feriado excluído.');
    },
  });

  const describe = (h: Holiday) =>
    h.scope === 'state'
      ? h.state
      : h.scope === 'city'
        ? `${h.city ?? ''}/${h.state ?? ''}`
        : h.scope === 'unit'
          ? unitName(h.unitId)
          : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Feriados</h1>
          <p className="text-muted-foreground">
            Aparecem na escala prevista das unidades a que se aplicam.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setMode('suggest')}>
              <SparklesIcon />
              Feriados nacionais
            </Button>
            <Button onClick={() => setMode('add')}>
              <PlusIcon />
              Novo feriado
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid w-40 gap-2">
        <Label htmlFor="holiday-year">Ano</Label>
        <Select id="holiday-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[-1, 0, 1, 2].map((offset) => {
            const value = new Date().getFullYear() + offset;
            return (
              <option key={value} value={value}>
                {value}
              </option>
            );
          })}
        </Select>
      </div>

      {mode === 'add' ? (
        <HolidayForm units={units.data ?? []} year={year} onClose={() => setMode('none')} />
      ) : null}
      {mode === 'suggest' ? (
        <NationalSuggestions
          year={year}
          existing={holidays.data ?? []}
          onClose={() => setMode('none')}
        />
      ) : null}

      {holidays.isError ? (
        <Alert variant="destructive">{errorMessage(holidays.error)}</Alert>
      ) : null}
      {remove.isError ? <Alert variant="destructive">{errorMessage(remove.error)}</Alert> : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Feriado</TableHead>
              <TableHead>Abrangência</TableHead>
              {canManage ? <TableHead className="sr-only">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.isPending ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : holidays.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum feriado cadastrado em {year}.
                </TableCell>
              </TableRow>
            ) : (
              holidays.data?.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(holiday.date)}</TableCell>
                  <TableCell>{holiday.name}</TableCell>
                  <TableCell>
                    {SCOPE_LABELS[holiday.scope]} {describe(holiday)}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir ${holiday.name}`}
                        onClick={() => {
                          if (window.confirm(`Excluir "${holiday.name}"?`)) remove.mutate(holiday);
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function HolidayForm({
  units,
  year,
  onClose,
}: {
  units: { id: string; name: string }[];
  year: number;
  onClose: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<HolidayInput>({
    resolver: zodResolver(holidayInputSchema),
    defaultValues: {
      date: `${year}-01-01`,
      name: '',
      scope: 'city',
      state: null,
      city: null,
      unitId: null,
    },
  });
  const scope = useWatch({ control: form.control, name: 'scope' });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await api.holidays.create(values);
      await queryClient.invalidateQueries({ queryKey: holidaysQueryKey });
      toast.success('Feriado cadastrado.');
      onClose();
    } catch (error) {
      applyFieldErrors(error, form.setError);
      setSubmitError(error);
    }
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={(e) => void submit(e)}>
          <FormField label="Data" error={errors.date?.message}>
            {(field) => <Input {...field} {...form.register('date')} type="date" />}
          </FormField>
          <FormField label="Nome" error={errors.name?.message}>
            {(field) => <Input {...field} {...form.register('name')} />}
          </FormField>
          <FormField label="Abrangência" error={errors.scope?.message}>
            {(field) => (
              <Select {...field} {...form.register('scope')}>
                {(Object.keys(SCOPE_LABELS) as HolidayScope[]).map((value) => (
                  <option key={value} value={value}>
                    {SCOPE_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {scope === 'state' || scope === 'city' ? (
            <FormField label="UF" error={errors.state?.message}>
              {(field) => (
                <Select {...field} {...form.register('state', { setValueAs: emptyToNull })}>
                  <option value="">—</option>
                  {BRAZILIAN_STATES.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          ) : null}
          {scope === 'city' ? (
            <FormField label="Município" error={errors.city?.message}>
              {(field) => (
                <Input {...field} {...form.register('city', { setValueAs: emptyToNull })} />
              )}
            </FormField>
          ) : null}
          {scope === 'unit' ? (
            <FormField label="Unidade" error={errors.unitId?.message}>
              {(field) => (
                <Select {...field} {...form.register('unitId', { setValueAs: emptyToNull })}>
                  <option value="">Selecione</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          ) : null}
          {submitError ? (
            <Alert variant="destructive" className="sm:col-span-2">
              {errorMessage(submitError)}
            </Alert>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              Salvar
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Feriados nacionais de data fixa (lei federal) para o RH conferir e escolher. */
function NationalSuggestions({
  year,
  existing,
  onClose,
}: {
  year: number;
  existing: Holiday[];
  onClose: () => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const suggestions = useQuery({
    queryKey: [...holidaysQueryKey, 'suggestions', year],
    queryFn: () => api.holidays.suggestions(year),
  });
  const already = new Set(existing.filter((h) => h.scope === 'national').map((h) => h.date));
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const available = suggestions.data?.filter((s) => !already.has(s.date)) ?? [];
  const chosen = selected ?? new Set(available.map((s) => s.date));

  const save = useMutation({
    mutationFn: async () => {
      for (const suggestion of available.filter((s) => chosen.has(s.date))) {
        await api.holidays.create({
          date: suggestion.date,
          name: suggestion.name,
          scope: 'national',
          state: null,
          city: null,
          unitId: null,
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: holidaysQueryKey });
      toast.success('Feriados nacionais cadastrados.');
      onClose();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Feriados nacionais de {year}</CardTitle>
        <CardDescription>
          Datas fixas definidas em lei federal. Confira antes de salvar. Feriados estaduais,
          municipais (inclusive religiosos, como a Sexta-feira da Paixão) e pontos facultativos
          devem ser cadastrados à parte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestions.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : available.length === 0 ? (
          <p className="text-muted-foreground">Todos já estão cadastrados.</p>
        ) : (
          <ul className="grid gap-2">
            {available.map((s) => (
              <li key={s.date} className="flex items-center gap-2">
                <Checkbox
                  id={`suggest-${s.date}`}
                  checked={chosen.has(s.date)}
                  onCheckedChange={(checked) => {
                    const next = new Set(chosen);
                    if (checked === true) next.add(s.date);
                    else next.delete(s.date);
                    setSelected(next);
                  }}
                />
                <Label htmlFor={`suggest-${s.date}`} className="font-normal">
                  {formatDate(s.date)} — {s.name}{' '}
                  <span className="text-muted-foreground">({s.legalBasis})</span>
                </Label>
              </li>
            ))}
          </ul>
        )}
        {save.isError ? <Alert variant="destructive">{errorMessage(save.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || available.length === 0 || chosen.size === 0}
          >
            {save.isPending ? <Spinner /> : null}
            Cadastrar selecionados
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
