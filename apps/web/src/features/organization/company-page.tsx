import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Company,
  type CompanyInput,
  companyInputSchema,
  formatCnpj,
} from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { applyFieldErrors } from '@/lib/form-errors';
import { errorMessage, useApi } from '@/lib/services';
import { BRAZIL_TIMEZONES } from '@/lib/timezones';
import { useCan } from '../access/access';
import { ClockSettingsCard } from '../time-tracking/clock-settings-card';
import { companyQueryKey } from './query-keys';

export function CompanyPage() {
  const api = useApi();
  const company = useQuery({ queryKey: companyQueryKey, queryFn: () => api.company.get() });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Empresa</h1>
        <p className="text-muted-foreground">Dados cadastrais e configurações gerais.</p>
      </div>
      {company.isError ? <Alert variant="destructive">{errorMessage(company.error)}</Alert> : null}
      <Card>
        <CardContent className="pt-6">
          {company.data ? (
            <CompanyFormLoader company={company.data} />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </CardContent>
      </Card>
      <ClockSettingsCard />
    </div>
  );
}

/** Espera os perfis carregarem: o select sem a opção atual perderia o valor ao salvar. */
function CompanyFormLoader({ company }: { company: Company }) {
  const api = useApi();
  const canReadRoles = useCan('roles:read');
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.access.roles.list(),
    enabled: canReadRoles,
  });
  if (canReadRoles && roles.isPending) return <Skeleton className="h-64 w-full" />;
  return <CompanyForm company={company} roles={roles.data} canReadRoles={canReadRoles} />;
}

function CompanyForm({
  company,
  roles,
  canReadRoles,
}: {
  company: Company;
  roles: { id: string; name: string }[] | undefined;
  canReadRoles: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<CompanyInput>({
    resolver: zodResolver(companyInputSchema),
    defaultValues: {
      name: company.name,
      legalName: company.legalName,
      cnpj: company.cnpj ? formatCnpj(company.cnpj) : null,
      timezone: company.timezone,
      defaultEmployeeRoleId: company.defaultEmployeeRoleId,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await api.company.update(values);
      await queryClient.invalidateQueries({ queryKey: companyQueryKey });
      toast.success('Dados da empresa salvos.');
    } catch (error) {
      applyFieldErrors(error, form.setError);
      setSubmitError(error);
    }
  });

  return (
    <form className="grid gap-4" noValidate onSubmit={(event) => void submit(event)}>
      <FormField label="Nome de exibição" error={errors.name?.message}>
        {(field) => <Input {...field} {...form.register('name')} />}
      </FormField>
      <FormField label="Razão social" error={errors.legalName?.message}>
        {(field) => <Input {...field} {...form.register('legalName')} />}
      </FormField>
      <FormField
        label="CNPJ"
        error={errors.cnpj?.message}
        hint="Aceita o formato numérico e o alfanumérico."
      >
        {(field) => (
          <Input {...field} {...form.register('cnpj', { setValueAs: (v: string) => v || null })} />
        )}
      </FormField>
      <FormField
        label="Fuso horário"
        error={errors.timezone?.message}
        hint="Padrão para exibir horários; cada posto de trabalho pode ter o seu."
      >
        {(field) => (
          <Select {...field} {...form.register('timezone')}>
            {BRAZIL_TIMEZONES.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormField
        label="Perfil das contas criadas para funcionários"
        error={errors.defaultEmployeeRoleId?.message}
        hint="Atribuído automaticamente quando o RH cria o acesso de um funcionário."
      >
        {(field) => (
          <Select
            {...field}
            disabled={!canReadRoles}
            {...form.register('defaultEmployeeRoleId', { setValueAs: (v: string) => v || null })}
          >
            <option value="">Nenhum</option>
            {/* Sem permissão para listar perfis, mantém o valor atual. */}
            {!canReadRoles && company.defaultEmployeeRoleId ? (
              <option value={company.defaultEmployeeRoleId}>Perfil atual</option>
            ) : null}
            {roles?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {submitError ? <Alert variant="destructive">{errorMessage(submitError)}</Alert> : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Salvar
        </Button>
      </div>
    </form>
  );
}
