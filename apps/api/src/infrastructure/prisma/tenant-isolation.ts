import { Prisma } from '../../generated/prisma/client';

/** Modelos com `companyId`, derivados do client gerado (não há lista manual para esquecer). */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.values(Prisma.ModelName).filter((model) => {
    const fields = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[
      `${model}ScalarFieldEnum`
    ];
    return fields !== undefined && 'companyId' in fields;
  }),
);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantViolationError';
  }
}

type Args = Record<string, unknown>;

function withFilter(where: unknown, filter: Args): Args {
  const current = (where ?? {}) as Args;
  const and =
    current.AND === undefined ? [] : Array.isArray(current.AND) ? current.AND : [current.AND];
  // Filtro em AND: se a consulta pedir outra empresa, o resultado é vazio (falha fechado).
  return { ...current, AND: [...(and as unknown[]), filter] };
}

function withCompanyId(data: unknown, companyId: string, model: string): Args {
  const record = (data ?? {}) as Args;
  if (record.companyId !== undefined && record.companyId !== companyId) {
    throw new TenantViolationError(`Tentativa de gravar ${model} em outra empresa`);
  }
  return { ...record, companyId };
}

/**
 * Aplica o isolamento por empresa aos argumentos de uma operação do Prisma.
 * - Modelos com `companyId`: toda consulta ganha `companyId = <empresa do contexto>` e toda
 *   criação recebe o `companyId` (gravar em outra empresa lança erro).
 * - `Company`: só a própria empresa é visível; criar ou excluir empresa não é permitido
 *   pelo client isolado.
 * - Demais modelos (catálogos globais, como `Permission`): sem filtro.
 *
 * Limite conhecido: escritas aninhadas (`create` dentro de `data` de outro modelo) não são
 * reescritas. As FKs compostas (id, company_id) no banco impedem vínculos entre empresas.
 */
export function applyTenantIsolation(
  model: string,
  operation: string,
  args: Args,
  companyId: string,
): Args {
  if (model === 'Company') {
    if (
      operation.startsWith('create') ||
      operation.startsWith('delete') ||
      operation === 'upsert'
    ) {
      throw new TenantViolationError('Empresas não podem ser criadas ou excluídas por aqui');
    }
    return WHERE_OPERATIONS.has(operation)
      ? { ...args, where: withFilter(args.where, { id: companyId }) }
      : args;
  }
  if (!TENANT_MODELS.has(model)) return args;

  const next: Args = { ...args };
  if (WHERE_OPERATIONS.has(operation)) next.where = withFilter(args.where, { companyId });
  if (CREATE_OPERATIONS.has(operation)) {
    if (operation === 'upsert') {
      next.create = withCompanyId(args.create, companyId, model);
    } else if (Array.isArray(args.data)) {
      next.data = args.data.map((item) => withCompanyId(item, companyId, model));
    } else {
      next.data = withCompanyId(args.data, companyId, model);
    }
  }
  if (
    (operation === 'update' || operation === 'updateMany' || operation === 'upsert') &&
    args.data
  ) {
    const data = (operation === 'upsert' ? args.update : args.data) as Args | undefined;
    if (data?.companyId !== undefined && data.companyId !== companyId) {
      throw new TenantViolationError(`Tentativa de mover ${model} para outra empresa`);
    }
  }
  return next;
}
