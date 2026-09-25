import { zodResolver } from '@hookform/resolvers/zod';
import {
  ApiError,
  type Permission,
  type PermissionInfo,
  type Role,
  type RoleInput,
  roleInputSchema,
  type RoleScope,
} from '@excellence/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/services';
import { describeScope, RESOURCE_LABELS, SCOPE_LABELS } from './labels';

/** Escopos marcáveis nesta tela; unidades e departamentos chegam com a etapa 1A.1. */
const SIMPLE_SCOPES = ['company', 'own_team', 'self'] as const;

type FormValues = RoleInput;

interface RoleFormProps {
  catalog: readonly PermissionInfo[];
  role?: Role | undefined;
  readOnly: boolean;
  onSubmit: (values: RoleInput) => Promise<unknown>;
}

export function RoleForm({ catalog, role, readOnly, onSubmit }: RoleFormProps) {
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(roleInputSchema),
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? null,
      requiresMfa: role?.requiresMfa ?? false,
      permissions: role?.permissions ?? [],
      scopes: role?.scopes ?? [{ type: 'self' }],
    },
  });
  const permissions = useWatch({ control: form.control, name: 'permissions' });
  const scopes = useWatch({ control: form.control, name: 'scopes' });
  const requiresMfa = useWatch({ control: form.control, name: 'requiresMfa' });
  const { errors, isSubmitting } = form.formState;

  const groups = new Map<string, PermissionInfo[]>();
  for (const permission of catalog) {
    groups.set(permission.resource, [...(groups.get(permission.resource) ?? []), permission]);
  }

  const togglePermission = (key: Permission, checked: boolean) => {
    const next = checked ? [...permissions, key] : permissions.filter((p) => p !== key);
    form.setValue('permissions', next, { shouldDirty: true });
  };

  const hasScope = (type: RoleScope['type']) => scopes.some((scope) => scope.type === type);
  const toggleScope = (type: (typeof SIMPLE_SCOPES)[number], checked: boolean) => {
    const next = checked ? [...scopes, { type }] : scopes.filter((scope) => scope.type !== type);
    form.setValue('scopes', next, { shouldDirty: true, shouldValidate: true });
  };
  const specificScopes = scopes.filter((s) => s.type === 'unit' || s.type === 'department');

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          form.setError(path as keyof FormValues, { message });
        }
      }
      setSubmitError(error);
    }
  });

  return (
    <form className="grid gap-8" onSubmit={(event) => void submit(event)} noValidate>
      <fieldset className="grid gap-4" disabled={readOnly}>
        <FormField label="Nome" error={errors.name?.message}>
          {(field) => <Input {...field} {...form.register('name')} />}
        </FormField>
        <FormField label="Descrição" error={errors.description?.message}>
          {(field) => (
            <Input
              {...field}
              {...form.register('description', { setValueAs: (v: string) => v || null })}
            />
          )}
        </FormField>
        <div className="flex items-center gap-2">
          <Checkbox
            id="requires-mfa"
            checked={requiresMfa ?? false}
            disabled={readOnly}
            onCheckedChange={(checked) =>
              form.setValue('requiresMfa', checked === true, { shouldDirty: true })
            }
          />
          <Label htmlFor="requires-mfa">Exigir verificação em duas etapas (MFA)</Label>
        </div>
      </fieldset>

      <section aria-labelledby="scopes-title" className="grid gap-3">
        <div>
          <h2 id="scopes-title" className="font-semibold">
            Escopo de dados
          </h2>
          <p className="text-sm text-muted-foreground">
            Quais registros quem tem este perfil enxerga. Com mais de um, vale a soma.
          </p>
        </div>
        {SIMPLE_SCOPES.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <Checkbox
              id={`scope-${type}`}
              checked={hasScope(type)}
              disabled={readOnly}
              onCheckedChange={(checked) => toggleScope(type, checked === true)}
            />
            <Label htmlFor={`scope-${type}`}>{SCOPE_LABELS[type]}</Label>
          </div>
        ))}
        {specificScopes.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Também: {specificScopes.map(describeScope).join(', ')}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          A escolha de unidades e departamentos específicos fica disponível com o cadastro de
          unidades.
        </p>
        {errors.scopes ? (
          <p className="text-sm text-destructive">
            {errors.scopes.message ?? errors.scopes.root?.message}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="permissions-title" className="grid gap-4">
        <div>
          <h2 id="permissions-title" className="font-semibold">
            Permissões
          </h2>
          <p className="text-sm text-muted-foreground">
            Você só pode conceder permissões que também possui.
          </p>
        </div>
        {[...groups.entries()].map(([resource, items]) => (
          <fieldset key={resource} className="grid gap-2 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">
              {RESOURCE_LABELS[resource] ?? resource}
            </legend>
            {items.map((permission) => (
              <div key={permission.key} className="flex items-start gap-2">
                <Checkbox
                  id={`perm-${permission.key}`}
                  className="mt-0.5"
                  checked={permissions.includes(permission.key)}
                  disabled={readOnly}
                  onCheckedChange={(checked) => togglePermission(permission.key, checked === true)}
                />
                <Label htmlFor={`perm-${permission.key}`} className="leading-snug font-normal">
                  {permission.description}
                  {permission.sensitive ? (
                    <Badge variant="outline" className="ml-2">
                      Dado sensível · leitura auditada
                    </Badge>
                  ) : null}
                </Label>
              </div>
            ))}
          </fieldset>
        ))}
      </section>

      {submitError ? <Alert variant="destructive">{errorMessage(submitError)}</Alert> : null}

      {readOnly ? null : (
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            Salvar perfil
          </Button>
        </div>
      )}
    </form>
  );
}
