/**
 * Deixa um ambiente (staging) só com um posto: apaga os outros postos da empresa dele, com
 * funcionários, pontos, rondas, escalas, atestados, VA/VT e contas de login desses
 * funcionários. Mantém a empresa, os perfis, os administradores, o cadastro geral (cargos,
 * benefícios, feriados da empresa) e o posto escolhido inteiro. Outras empresas não são tocadas.
 *
 * Tudo numa transação. Os gatilhos "só acrescenta" (ponto, auditoria, folha...) ficam
 * desligados só dentro dela. O que depende de uma linha apagada é achado pelas chaves
 * estrangeiras do banco: se a coluna aceita nulo, vira nulo; se não, a linha também sai.
 * Antes de confirmar, as contagens do posto mantido são comparadas: se qualquer uma mudar,
 * tudo é desfeito. Sem PRUNE_APPLY=true é simulação (desfaz no fim e imprime as contagens).
 *
 * Variáveis: DATABASE_URL, PRUNE_KEEP_UNIT (nome do posto), PRUNE_APPLY.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { type Prisma, PrismaClient } from '../src/generated/prisma/client';

class DryRun extends Error {}

type Tx = Prisma.TransactionClient;
interface ForeignKey {
  child: string;
  childCols: string[];
  parentCols: string[];
  childNotNull: boolean[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Defina ${key}.`);
  return value;
}

function uuidLiteral(value: string): string {
  if (!UUID.test(value)) throw new Error(`Id inesperado: ${value}`);
  return `'${value}'::uuid`;
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

class Pruner {
  private readonly fkCache = new Map<string, ForeignKey[]>();
  readonly deleted = new Map<string, number>();
  readonly nulled = new Map<string, number>();

  constructor(private readonly tx: Tx) {}

  private async foreignKeys(table: string): Promise<ForeignKey[]> {
    const cached = this.fkCache.get(table);
    if (cached) return cached;
    const rows = await this.tx.$queryRawUnsafe<ForeignKey[]>(
      `SELECT c.conrelid::regclass::text AS child,
              array(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS "childCols",
              array(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
                    JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS "parentCols",
              array(SELECT a.attnotnull FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS "childNotNull"
         FROM pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid = $1::regclass`,
      table,
    );
    this.fkCache.set(table, rows);
    return rows;
  }

  /** Apaga as linhas de `table` que atendem `where`, antes resolvendo quem aponta para elas. */
  async purge(table: string, where: string, depth = 0): Promise<void> {
    if (depth > 10) throw new Error(`Dependências demais a partir de ${table}.`);
    for (const fk of await this.foreignKeys(table)) {
      const childCols = fk.childCols.map((c) => `"${c}"`).join(', ');
      const parentCols = fk.parentCols.map((c) => `"${c}"`).join(', ');
      const childWhere = `(${childCols}) IN (SELECT ${parentCols} FROM ${table} WHERE ${where})`;
      // company_id faz parte da chave composta, mas nunca é a referência em si.
      const refs = fk.childCols
        .map((col, i) => ({ col, notNull: fk.childNotNull[i] }))
        .filter((ref) => ref.col !== 'company_id');
      if (refs.length > 0 && refs.every((ref) => !ref.notNull)) {
        const set = refs.map((ref) => `"${ref.col}" = NULL`).join(', ');
        const count = await this.tx.$executeRawUnsafe(
          `UPDATE ${fk.child} SET ${set} WHERE ${childWhere}`,
        );
        if (count > 0) this.nulled.set(fk.child, (this.nulled.get(fk.child) ?? 0) + count);
      } else {
        await this.purge(fk.child, childWhere, depth + 1);
      }
    }
    const count = await this.tx.$executeRawUnsafe(`DELETE FROM ${table} WHERE ${where}`);
    if (count > 0) this.deleted.set(table, (this.deleted.get(table) ?? 0) + count);
  }
}

async function guardedTables(tx: Tx): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<{ name: string }[]>(
    `SELECT DISTINCT t.tgrelid::regclass::text AS name
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname = current_schema()`,
  );
  return rows.map((row) => row.name);
}

/** Contagens do que precisa sobreviver intacto. */
async function keptCounts(tx: Tx, U: string): Promise<Record<string, number>> {
  const queries: Record<string, string> = {
    posto: `SELECT count(*) FROM units WHERE id = ${U}`,
    funcionarios: `SELECT count(*) FROM employees WHERE unit_id = ${U}`,
    contas: `SELECT count(*) FROM employees WHERE unit_id = ${U} AND user_id IS NOT NULL`,
    pontos: `SELECT count(*) FROM time_entries WHERE employee_id IN (SELECT id FROM employees WHERE unit_id = ${U})`,
    escalas_atribuidas: `SELECT count(*) FROM employee_schedule_assignments WHERE employee_id IN (SELECT id FROM employees WHERE unit_id = ${U})`,
    beneficios_atribuidos: `SELECT count(*) FROM employee_benefits WHERE employee_id IN (SELECT id FROM employees WHERE unit_id = ${U})`,
    valores_plantao: `SELECT count(*) FROM schedule_rates WHERE unit_id = ${U}`,
    pontos_ronda: `SELECT count(*) FROM patrol_points WHERE unit_id = ${U}`,
    rotas_ronda: `SELECT count(*) FROM patrol_routes WHERE unit_id = ${U}`,
    rondas: `SELECT count(*) FROM patrol_runs WHERE unit_id = ${U}`,
    escalas: `SELECT count(*) FROM work_schedules WHERE unit_id = ${U}
                OR id IN (SELECT schedule_id FROM schedule_rates WHERE unit_id = ${U})`,
    turnos: `SELECT count(*) FROM shifts WHERE unit_id = ${U}`,
  };
  const result: Record<string, number> = {};
  for (const [key, sql] of Object.entries(queries)) {
    const [row] = await tx.$queryRawUnsafe<{ count: bigint }[]>(sql);
    result[key] = Number(row?.count ?? 0);
  }
  return result;
}

async function main(): Promise<void> {
  const apply = process.env.PRUNE_APPLY === 'true';
  const unitName = required('PRUNE_KEEP_UNIT');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
  });
  try {
    const units = await prisma.unit.findMany({
      where: { name: { equals: unitName, mode: 'insensitive' } },
      select: { id: true, companyId: true, name: true },
    });
    const [unit] = units;
    if (!unit || units.length !== 1) {
      throw new Error(`Esperava 1 posto "${unitName}"; achei ${units.length}.`);
    }
    const U = uuidLiteral(unit.id);
    const C = uuidLiteral(unit.companyId);
    const otherCompanies = await prisma.company.count({ where: { id: { not: unit.companyId } } });

    await prisma
      .$transaction(
        async (tx) => {
          const before = await keptCounts(tx, U);
          const guarded = await guardedTables(tx);
          for (const table of guarded)
            await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER USER`);

          const pruner = new Pruner(tx);
          // Contas de login dos funcionários que vão sair (decididas antes de apagá-los).
          const doomedUsers = await tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT user_id::text AS id FROM employees
              WHERE company_id = ${C} AND unit_id <> ${U} AND user_id IS NOT NULL`,
          );

          await pruner.purge('employees', `company_id = ${C} AND unit_id <> ${U}`);
          await pruner.purge(
            'departments',
            `company_id = ${C} AND unit_id IS NOT NULL AND unit_id <> ${U}`,
          );
          await pruner.purge(
            'holidays',
            `company_id = ${C} AND unit_id IS NOT NULL AND unit_id <> ${U}`,
          );
          // Escalas e turnos de outros postos, menos os que o posto mantido ainda usa.
          await pruner.purge(
            'work_schedules',
            `company_id = ${C} AND unit_id IS NOT NULL AND unit_id <> ${U}
               AND id NOT IN (SELECT schedule_id FROM employee_schedule_assignments)
               AND id NOT IN (SELECT schedule_id FROM schedule_rates WHERE unit_id = ${U})`,
          );
          await pruner.purge(
            'shifts',
            `company_id = ${C} AND unit_id IS NOT NULL AND unit_id <> ${U}
               AND id NOT IN (SELECT shift_id FROM work_schedule_days WHERE shift_id IS NOT NULL)`,
          );
          await pruner.purge('units', `company_id = ${C} AND id <> ${U}`);

          // Só contas que eram apenas de funcionário (sem outro perfil além do padrão).
          const ids = doomedUsers.map((row) => uuidLiteral(row.id));
          if (ids.length > 0) {
            await pruner.purge(
              'users',
              `id IN (${ids.join(', ')})
                 AND id NOT IN (SELECT user_id FROM employees WHERE user_id IS NOT NULL)
                 AND NOT EXISTS (
                   SELECT 1 FROM user_roles ur JOIN companies co ON co.id = ur.company_id
                    WHERE ur.user_id = users.id
                      AND ur.role_id IS DISTINCT FROM co.default_employee_role_id)`,
            );
          }

          for (const table of guarded)
            await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
          const after = await keptCounts(tx, U);

          log(`Posto mantido: ${unit.name} (${unit.id})`);
          log('Mantido (antes → depois):');
          const changed: string[] = [];
          for (const key of Object.keys(before)) {
            log(`  ${key}: ${before[key]} → ${after[key]}`);
            if (before[key] !== after[key]) changed.push(key);
          }
          log('Apagado:');
          for (const [table, count] of [...pruner.deleted].sort()) log(`  ${table}: ${count}`);
          if (pruner.nulled.size > 0) {
            log('Referências zeradas (a linha fica, o vínculo com o apagado vira nulo):');
            for (const [table, count] of [...pruner.nulled].sort()) log(`  ${table}: ${count}`);
          }
          if (otherCompanies > 0) log(`Outras empresas no banco (não tocadas): ${otherCompanies}.`);
          if (changed.length > 0) {
            throw new Error(`O posto mantido mudou (${changed.join(', ')}). Nada foi apagado.`);
          }
          if (!apply) throw new DryRun();
        },
        { timeout: 600_000, maxWait: 30_000 },
      )
      .catch((error: unknown) => {
        if (error instanceof DryRun) {
          log('\nSIMULAÇÃO: nada foi apagado. Rode de novo com "aplicar" para apagar.');
          return;
        }
        throw error;
      });
    if (apply) log('\nApagado.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
