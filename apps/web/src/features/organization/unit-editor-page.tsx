import { zodResolver } from '@hookform/resolvers/zod';
import {
  BRAZILIAN_STATES,
  formatCnpj,
  GEOFENCE_RADIUS_LIMITS,
  type Unit,
  type UnitInput,
  unitInputSchema,
} from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, LocateFixedIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { getCurrentPosition } from '@/lib/device/geolocation';
import { applyFieldErrors } from '@/lib/form-errors';
import { emptyToNull, numberOrNull } from '@/lib/form-values';
import { errorMessage, useApi } from '@/lib/services';
import { BRAZIL_TIMEZONES } from '@/lib/timezones';
import { useCan } from '../access/access';
import { unitsQueryKey } from './query-keys';

export function UnitEditorPage() {
  const { id } = useParams();
  const api = useApi();
  const unit = useQuery({
    queryKey: [...unitsQueryKey, id],
    queryFn: () => api.units.get(id ?? ''),
    enabled: id !== undefined,
  });
  const loading = id !== undefined && unit.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/cadastros/postos">
          <ArrowLeftIcon />
          Postos de trabalho
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold">
        {id ? (unit.data?.name ?? 'Posto de trabalho') : 'Novo posto de trabalho'}
      </h1>
      {unit.isError ? <Alert variant="destructive">{errorMessage(unit.error)}</Alert> : null}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <UnitForm key={unit.data?.id ?? 'nova'} unit={unit.data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UnitForm({ unit }: { unit: Unit | undefined }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan('units:manage');
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [locating, setLocating] = useState(false);
  const form = useForm<UnitInput>({
    resolver: zodResolver(unitInputSchema),
    defaultValues: {
      name: unit?.name ?? '',
      code: unit?.code ?? null,
      cnpj: unit?.cnpj ? formatCnpj(unit.cnpj) : null,
      street: unit?.street ?? null,
      number: unit?.number ?? null,
      complement: unit?.complement ?? null,
      district: unit?.district ?? null,
      city: unit?.city ?? null,
      state: (unit?.state as UnitInput['state']) ?? null,
      postalCode: unit?.postalCode ?? null,
      latitude: unit?.latitude ?? null,
      longitude: unit?.longitude ?? null,
      geofenceRadiusMeters: unit?.geofenceRadiusMeters ?? null,
      timezone: unit?.timezone ?? null,
      isActive: unit?.isActive ?? true,
    },
  });
  const isActive = useWatch({ control: form.control, name: 'isActive' });
  const { errors, isSubmitting } = form.formState;

  const locate = async () => {
    setLocating(true);
    try {
      const position = await getCurrentPosition();
      form.setValue('latitude', Number(position.latitude.toFixed(6)), { shouldDirty: true });
      form.setValue('longitude', Number(position.longitude.toFixed(6)), { shouldDirty: true });
      toast.info(`Localização obtida com precisão de ${Math.round(position.accuracyMeters)} m.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível obter a localização.');
    } finally {
      setLocating(false);
    }
  };

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const saved = unit ? await api.units.update(unit.id, values) : await api.units.create(values);
      await queryClient.invalidateQueries({ queryKey: unitsQueryKey });
      toast.success('Posto de trabalho salvo.');
      if (!unit) void navigate(`/cadastros/postos/${saved.id}`, { replace: true });
    } catch (error) {
      applyFieldErrors(error, form.setError);
      setSubmitError(error);
    }
  });

  const remove = async () => {
    if (!unit || !window.confirm(`Excluir o posto "${unit.name}"?`)) return;
    try {
      await api.units.remove(unit.id);
      await queryClient.invalidateQueries({ queryKey: unitsQueryKey });
      toast.success('Posto de trabalho excluído.');
      void navigate('/cadastros/postos', { replace: true });
    } catch (error) {
      setSubmitError(error);
    }
  };

  const text = (
    name: 'code' | 'street' | 'number' | 'complement' | 'district' | 'city' | 'postalCode' | 'cnpj',
  ) => form.register(name, { setValueAs: emptyToNull });

  return (
    <form className="grid gap-6" noValidate onSubmit={(event) => void submit(event)}>
      <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField label="Nome" error={errors.name?.message}>
            {(field) => <Input {...field} {...form.register('name')} />}
          </FormField>
        </div>
        <FormField
          label="Código"
          error={errors.code?.message}
          hint="Usado na importação de funcionários."
        >
          {(field) => <Input {...field} {...text('code')} />}
        </FormField>
        <FormField label="CNPJ do posto" error={errors.cnpj?.message}>
          {(field) => <Input {...field} {...text('cnpj')} />}
        </FormField>
        <FormField label="CEP" error={errors.postalCode?.message}>
          {(field) => <Input {...field} {...text('postalCode')} inputMode="numeric" />}
        </FormField>
        <FormField label="Logradouro" error={errors.street?.message}>
          {(field) => <Input {...field} {...text('street')} />}
        </FormField>
        <FormField label="Número" error={errors.number?.message}>
          {(field) => <Input {...field} {...text('number')} />}
        </FormField>
        <FormField label="Complemento" error={errors.complement?.message}>
          {(field) => <Input {...field} {...text('complement')} />}
        </FormField>
        <FormField label="Bairro" error={errors.district?.message}>
          {(field) => <Input {...field} {...text('district')} />}
        </FormField>
        <FormField label="Cidade" error={errors.city?.message}>
          {(field) => <Input {...field} {...text('city')} />}
        </FormField>
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
        <FormField label="Fuso horário" error={errors.timezone?.message}>
          {(field) => (
            <Select {...field} {...form.register('timezone', { setValueAs: emptyToNull })}>
              <option value="">Mesmo da empresa</option>
              {BRAZIL_TIMEZONES.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </fieldset>

      <fieldset disabled={!canManage} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-medium">Localização e cerca virtual</legend>
        <p className="text-sm text-muted-foreground sm:col-span-3">
          A cerca virtual é o raio, a partir das coordenadas, usado para conferir a localização das
          marcações de ponto e dos check-ins de ronda.
        </p>
        <FormField label="Latitude" error={errors.latitude?.message}>
          {(field) => (
            <Input
              {...field}
              {...form.register('latitude', { setValueAs: numberOrNull })}
              inputMode="decimal"
            />
          )}
        </FormField>
        <FormField label="Longitude" error={errors.longitude?.message}>
          {(field) => (
            <Input
              {...field}
              {...form.register('longitude', { setValueAs: numberOrNull })}
              inputMode="decimal"
            />
          )}
        </FormField>
        <FormField
          label="Raio (metros)"
          error={errors.geofenceRadiusMeters?.message}
          hint={`De ${GEOFENCE_RADIUS_LIMITS.min} a ${GEOFENCE_RADIUS_LIMITS.max} m. Vazio = sem cerca.`}
        >
          {(field) => (
            <Input
              {...field}
              {...form.register('geofenceRadiusMeters', { setValueAs: numberOrNull })}
              inputMode="numeric"
            />
          )}
        </FormField>
        <div className="sm:col-span-3">
          <Button type="button" variant="outline" onClick={() => void locate()} disabled={locating}>
            {locating ? <Spinner /> : <LocateFixedIcon />}
            Usar minha localização atual
          </Button>
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Checkbox
          id="unit-active"
          checked={isActive ?? true}
          disabled={!canManage}
          onCheckedChange={(checked) =>
            form.setValue('isActive', checked === true, { shouldDirty: true })
          }
        />
        <Label htmlFor="unit-active">Posto ativo</Label>
      </div>

      {submitError ? <Alert variant="destructive">{errorMessage(submitError)}</Alert> : null}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Salvar posto
          </Button>
          {unit ? (
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
