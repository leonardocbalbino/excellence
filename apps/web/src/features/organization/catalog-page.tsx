import { zodResolver } from '@hookform/resolvers/zod';
import type { Permission } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { type FieldValues, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { emptyToNull, numberOrNull } from '@/lib/form-values';
import { errorMessage } from '@/lib/services';
import { useCan } from '../access/access';

export interface CatalogItem {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CatalogField {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'time';
  options?: { value: string; label: string }[];
  hint?: string;
  /** Vazio vira null. */
  optional?: boolean;
}

export interface CatalogConfig<T extends CatalogItem> {
  title: string;
  description: string;
  singular: string;
  managePermission: Permission;
  queryKey: readonly string[];
  schema: z.ZodType<FieldValues, FieldValues>;
  fields: CatalogField[];
  columns: { header: string; cell: (item: T) => ReactNode }[];
  defaults: (item?: T) => FieldValues;
  list: (includeInactive: boolean) => Promise<T[]>;
  create: (values: FieldValues) => Promise<unknown>;
  update: (id: string, values: FieldValues) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  /** false enquanto as opções dos selects carregam (evita perder o valor ao editar). */
  ready?: boolean;
  /** Ações extras no cabeçalho (ex.: imprimir QR codes). */
  actions?: ReactNode;
}

/** Página de cadastro simples: lista com edição no próprio lugar. */
export function CatalogPage<T extends CatalogItem>({ config }: { config: CatalogConfig<T> }) {
  const canManage = useCan(config.managePermission);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const items = useQuery({
    queryKey: [...config.queryKey, { includeInactive }],
    queryFn: () => config.list(includeInactive),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{config.title}</h1>
          <p className="text-muted-foreground">{config.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.actions}
          {canManage && editing === null ? (
            <Button onClick={() => setEditing('new')} disabled={config.ready === false}>
              <PlusIcon />
              Novo {config.singular}
            </Button>
          ) : null}
        </div>
      </div>

      {editing !== null ? (
        <Card>
          <CardContent className="pt-6">
            <CatalogForm
              key={editing === 'new' ? 'new' : editing.id}
              config={config}
              item={editing === 'new' ? undefined : editing}
              onClose={() => setEditing(null)}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center gap-2">
        <Checkbox
          id="catalog-inactive"
          checked={includeInactive}
          onCheckedChange={(checked) => setIncludeInactive(checked === true)}
        />
        <Label htmlFor="catalog-inactive">Mostrar inativos</Label>
      </div>
      {items.isError ? <Alert variant="destructive">{errorMessage(items.error)}</Alert> : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              {config.columns.map((column) => (
                <TableHead key={column.header}>{column.header}</TableHead>
              ))}
              {canManage ? <TableHead className="sr-only">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.isPending ? (
              <TableRow>
                <TableCell colSpan={config.columns.length + 2}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : items.data?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={config.columns.length + 2}
                  className="text-center text-muted-foreground"
                >
                  Nenhum registro.
                </TableCell>
              </TableRow>
            ) : (
              items.data?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.name}
                    {item.isActive ? null : (
                      <Badge variant="secondary" className="ml-2">
                        Inativo
                      </Badge>
                    )}
                  </TableCell>
                  {config.columns.map((column) => (
                    <TableCell key={column.header}>{column.cell(item)}</TableCell>
                  ))}
                  {canManage ? (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${item.name}`}
                        disabled={config.ready === false}
                        onClick={() => setEditing(item)}
                      >
                        <PencilIcon />
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

function CatalogForm<T extends CatalogItem>({
  config,
  item,
  onClose,
}: {
  config: CatalogConfig<T>;
  item: T | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm({
    resolver: zodResolver(config.schema),
    defaultValues: config.defaults(item),
  });
  const { errors, isSubmitting } = form.formState;
  const refresh = () => queryClient.invalidateQueries({ queryKey: config.queryKey });

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      if (item) await config.update(item.id, values);
      else await config.create(values);
      await refresh();
      toast.success(`${capitalize(config.singular)} salvo.`);
      onClose();
    } catch (error) {
      applyFieldErrors(error, form.setError);
      setSubmitError(error);
    }
  });

  const remove = async () => {
    if (!item || !window.confirm(`Excluir "${item.name}"?`)) return;
    try {
      await config.remove(item.id);
      await refresh();
      toast.success(`${capitalize(config.singular)} excluído.`);
      onClose();
    } catch (error) {
      setSubmitError(error);
    }
  };

  const toValue = (field: CatalogField) => (raw: unknown) => {
    const text = emptyToNull(raw);
    if (text === null) return field.optional ? null : '';
    return field.kind === 'number' ? numberOrNull(text) : text;
  };

  return (
    <form className="grid gap-4" noValidate onSubmit={(event) => void submit(event)}>
      <h2 className="font-semibold">
        {item ? `Editar ${config.singular}` : `Novo ${config.singular}`}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {config.fields.map((field) => {
          const message = errors[field.name]?.message;
          const register = form.register(field.name, { setValueAs: toValue(field) });
          return (
            <FormField
              key={field.name}
              label={field.label}
              error={typeof message === 'string' ? message : undefined}
              {...(field.hint ? { hint: field.hint } : {})}
            >
              {(props) =>
                field.kind === 'select' ? (
                  <Select {...props} {...register}>
                    {field.optional ? <option value="">—</option> : null}
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    {...props}
                    {...register}
                    inputMode={field.kind === 'number' ? 'numeric' : undefined}
                    {...(field.kind === 'time' ? { type: 'time' } : {})}
                  />
                )
              }
            </FormField>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="catalog-active"
          defaultChecked={(config.defaults(item).isActive as boolean | undefined) ?? true}
          onCheckedChange={(checked) => form.setValue('isActive', checked === true)}
        />
        <Label htmlFor="catalog-active">Ativo</Label>
      </div>
      {submitError ? <Alert variant="destructive">{errorMessage(submitError)}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        {item ? (
          <Button type="button" variant="outline" onClick={() => void remove()}>
            <Trash2Icon />
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
