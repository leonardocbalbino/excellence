import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreatedAccount,
  createAccountInputSchema,
  type Employee,
  type EmployeeInput,
  employeeInputSchema,
  formatCpf,
} from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, CopyIcon, KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { applyFieldErrors } from '@/lib/form-errors';
import { emptyToNull } from '@/lib/form-values';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import {
  departmentsQueryKey,
  positionsQueryKey,
  unionsQueryKey,
  unitsQueryKey,
} from '../organization/query-keys';
import { employeesQueryKey } from './query-keys';

export function EmployeeEditorPage() {
  const { id } = useParams();
  const api = useApi();
  const employee = useQuery({
    queryKey: [...employeesQueryKey, id],
    queryFn: () => api.employees.get(id ?? ''),
    enabled: id !== undefined,
  });
  const title = id
    ? employee.data
      ? (employee.data.socialName ?? employee.data.name)
      : 'Funcionário'
    : 'Novo funcionário';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/pessoas">
          <ArrowLeftIcon />
          Funcionários
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {employee.data?.status === 'terminated' ? (
          <Badge variant="secondary">Desligado</Badge>
        ) : null}
      </div>
      {employee.isError ? (
        <Alert variant="destructive">{errorMessage(employee.error)}</Alert>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          {id !== undefined && employee.isPending ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <EmployeeForm key={employee.data?.id ?? 'novo'} employee={employee.data} />
          )}
        </CardContent>
      </Card>
      {employee.data ? <AccountPanel employee={employee.data} /> : null}
    </div>
  );
}

/**
 * Carrega as opções dos selects antes de montar o formulário: um select renderizado sem a
 * opção do valor atual perde esse valor, e salvar apagaria o dado (ex.: o gestor).
 */
function EmployeeForm({ employee }: { employee: Employee | undefined }) {
  const api = useApi();
  const options = {
    units: useQuery({ queryKey: [...unitsQueryKey, 'options'], queryFn: () => api.units.list() }),
    departments: useQuery({
      queryKey: [...departmentsQueryKey, 'options'],
      queryFn: () => api.departments.list(),
    }),
    positions: useQuery({
      queryKey: [...positionsQueryKey, 'options'],
      queryFn: () => api.positions.list(),
    }),
    unions: useQuery({
      queryKey: [...unionsQueryKey, 'options'],
      queryFn: () => api.unions.list(),
    }),
    // Gestores possíveis: funcionários ativos no escopo (até 100).
    managers: useQuery({
      queryKey: [...employeesQueryKey, 'managers'],
      queryFn: () => api.employees.list({ pageSize: 100 }),
    }),
  };
  const queries = Object.values(options);
  if (queries.some((query) => query.isError)) {
    return <Alert variant="destructive">Não foi possível carregar as opções do cadastro.</Alert>;
  }
  if (queries.some((query) => query.isPending)) return <Skeleton className="h-96 w-full" />;

  // O gestor atual sempre aparece, mesmo fora dos 100 primeiros da lista.
  const managers = (options.managers.data?.items ?? [])
    .filter((m) => m.id !== employee?.id)
    .map((m) => ({ id: m.id, label: `${m.socialName ?? m.name} (${m.registrationNumber})` }));
  if (employee?.manager && !managers.some((m) => m.id === employee.manager?.id)) {
    managers.unshift({ id: employee.manager.id, label: employee.manager.name });
  }

  return (
    <EmployeeFormFields
      employee={employee}
      units={options.units.data ?? []}
      departments={options.departments.data ?? []}
      positions={options.positions.data ?? []}
      unions={options.unions.data ?? []}
      managers={managers}
    />
  );
}

interface Option {
  id: string;
  name: string;
}

function EmployeeFormFields({
  employee,
  units,
  departments: allDepartments,
  positions,
  unions,
  managers,
}: {
  employee: Employee | undefined;
  units: Option[];
  departments: (Option & { unitId: string | null })[];
  positions: Option[];
  unions: Option[];
  managers: { id: string; label: string }[];
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan('employees:manage');
  const [submitError, setSubmitError] = useState<unknown>(null);

  const form = useForm<EmployeeInput>({
    resolver: zodResolver(employeeInputSchema),
    defaultValues: {
      registrationNumber: employee?.registrationNumber ?? '',
      name: employee?.name ?? '',
      socialName: employee?.socialName ?? null,
      cpf: employee ? formatCpf(employee.cpf) : '',
      pis: employee?.pis ?? null,
      birthDate: employee?.birthDate ?? null,
      email: employee?.email ?? null,
      phone: employee?.phone ?? null,
      hireDate: employee?.hireDate ?? '',
      terminationDate: employee?.terminationDate ?? null,
      unitId: employee?.unit.id ?? '',
      departmentId: employee?.department?.id ?? null,
      positionId: employee?.position?.id ?? null,
      unionId: employee?.union?.id ?? null,
      managerId: employee?.manager?.id ?? null,
    },
  });
  const unitId = useWatch({ control: form.control, name: 'unitId' });
  const { errors, isSubmitting } = form.formState;
  // Só departamentos gerais ou da unidade escolhida.
  const departments = allDepartments.filter((d) => !d.unitId || d.unitId === unitId);

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const saved = employee
        ? await api.employees.update(employee.id, values)
        : await api.employees.create(values);
      await queryClient.invalidateQueries({ queryKey: employeesQueryKey });
      toast.success('Cadastro salvo.');
      if (!employee) void navigate(`/pessoas/${saved.id}`, { replace: true });
    } catch (error) {
      applyFieldErrors(error, form.setError);
      setSubmitError(error);
    }
  });

  const optional = { setValueAs: emptyToNull };

  return (
    <form className="grid gap-6" noValidate onSubmit={(event) => void submit(event)}>
      <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Dados pessoais</legend>
        <FormField label="Nome completo" error={errors.name?.message}>
          {(field) => <Input {...field} {...form.register('name')} autoComplete="off" />}
        </FormField>
        <FormField
          label="Nome social"
          error={errors.socialName?.message}
          hint="Quando informado, é o nome exibido."
        >
          {(field) => <Input {...field} {...form.register('socialName', optional)} />}
        </FormField>
        <FormField label="Matrícula" error={errors.registrationNumber?.message}>
          {(field) => <Input {...field} {...form.register('registrationNumber')} />}
        </FormField>
        <FormField label="CPF" error={errors.cpf?.message}>
          {(field) => <Input {...field} {...form.register('cpf')} inputMode="numeric" />}
        </FormField>
        <FormField label="PIS/NIS" error={errors.pis?.message}>
          {(field) => <Input {...field} {...form.register('pis', optional)} inputMode="numeric" />}
        </FormField>
        <FormField label="Data de nascimento" error={errors.birthDate?.message}>
          {(field) => <Input {...field} {...form.register('birthDate', optional)} type="date" />}
        </FormField>
        <FormField label="E-mail" error={errors.email?.message}>
          {(field) => <Input {...field} {...form.register('email', optional)} type="email" />}
        </FormField>
        <FormField label="Telefone" error={errors.phone?.message}>
          {(field) => <Input {...field} {...form.register('phone', optional)} type="tel" />}
        </FormField>
      </fieldset>

      <fieldset disabled={!canManage} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Vínculo</legend>
        <FormField label="Admissão" error={errors.hireDate?.message}>
          {(field) => <Input {...field} {...form.register('hireDate')} type="date" />}
        </FormField>
        <FormField
          label="Desligamento"
          error={errors.terminationDate?.message}
          hint="Último dia de trabalho. Vazio = ativo."
        >
          {(field) => (
            <Input {...field} {...form.register('terminationDate', optional)} type="date" />
          )}
        </FormField>
        <FormField label="Unidade" error={errors.unitId?.message}>
          {(field) => (
            <Select {...field} {...form.register('unitId')}>
              <option value="">Selecione</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Departamento" error={errors.departmentId?.message}>
          {(field) => (
            <Select {...field} {...form.register('departmentId', optional)}>
              <option value="">—</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Cargo" error={errors.positionId?.message}>
          {(field) => (
            <Select {...field} {...form.register('positionId', optional)}>
              <option value="">—</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Sindicato" error={errors.unionId?.message}>
          {(field) => (
            <Select {...field} {...form.register('unionId', optional)}>
              <option value="">—</option>
              {unions.map((union) => (
                <option key={union.id} value={union.id}>
                  {union.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <div className="sm:col-span-2">
          <FormField
            label="Gestor direto"
            error={errors.managerId?.message}
            hint="Define a equipe que o gestor acompanha e aprova."
          >
            {(field) => (
              <Select {...field} {...form.register('managerId', optional)}>
                <option value="">Sem gestor</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
      </fieldset>

      {submitError ? <Alert variant="destructive">{errorMessage(submitError)}</Alert> : null}
      {canManage ? (
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Salvar cadastro
          </Button>
        </div>
      ) : null}
    </form>
  );
}

type AccountValues = z.input<typeof createAccountInputSchema>;

function AccountPanel({ employee }: { employee: Employee }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const canManage = useCan('employees:manage');
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const form = useForm<AccountValues>({
    resolver: zodResolver(createAccountInputSchema),
    defaultValues: { email: employee.email ?? '' },
  });
  const create = useMutation({
    mutationFn: (values: AccountValues) => api.employees.createAccount(employee.id, values),
    onSuccess: async (account) => {
      setCreated(account);
      await queryClient.invalidateQueries({ queryKey: employeesQueryKey });
    },
    onError: (error) => applyFieldErrors(error, form.setError),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRoundIcon className="size-4" aria-hidden="true" />
          Acesso ao sistema
        </CardTitle>
        <CardDescription>
          {employee.userId && !created
            ? 'Este funcionário já tem conta de acesso.'
            : 'Crie o login para o funcionário bater ponto, fazer rondas e consultar documentos.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {created ? (
          <div className="grid gap-3">
            <Alert variant="warning">
              Anote e entregue a senha temporária agora: ela não será exibida de novo. No primeiro
              acesso, o funcionário cria a própria senha.
            </Alert>
            <dl className="grid gap-1 text-sm">
              <dt className="text-muted-foreground">Login</dt>
              <dd className="font-medium">{created.email}</dd>
              <dt className="text-muted-foreground">Senha temporária</dt>
              <dd className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono text-base">
                  {created.temporaryPassword}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Copiar senha temporária"
                  onClick={() => {
                    void navigator.clipboard.writeText(created.temporaryPassword).then(() => {
                      toast.success('Senha copiada.');
                    });
                  }}
                >
                  <CopyIcon />
                </Button>
              </dd>
            </dl>
          </div>
        ) : employee.userId || !canManage ? null : (
          <form
            className="flex flex-wrap items-end gap-3"
            noValidate
            onSubmit={(event) => void form.handleSubmit((values) => create.mutate(values))(event)}
          >
            <div className="w-full sm:w-80">
              <FormField label="E-mail de login" error={form.formState.errors.email?.message}>
                {(field) => <Input {...field} {...form.register('email')} type="email" />}
              </FormField>
            </div>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : null}
              Criar acesso
            </Button>
            {create.isError && !form.formState.errors.email ? (
              <Alert variant="destructive" className="w-full">
                {errorMessage(create.error)}
              </Alert>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
