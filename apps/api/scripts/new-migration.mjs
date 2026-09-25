// Gera uma migration comparando o banco local (já migrado) com o schema.prisma.
// Uso: pnpm --filter @excellence/api db:new-migration <nome_em_snake_case>
//
// Objetos mantidos só em SQL (prisma/sql-managed.json) têm seus DROP removidos, porque o
// Prisma não os conhece e tentaria apagá-los. Revise sempre o SQL gerado antes do commit.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  process.stderr.write('Informe o nome da migration em snake_case. Ex.: add_units\n');
  process.exit(1);
}

const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: root, stdio: 'inherit' });
const sql = execFileSync(
  process.execPath,
  [
    prismaCli,
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'prisma/schema.prisma',
    '--script',
  ],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);

const managed = JSON.parse(readFileSync(join(root, 'prisma/sql-managed.json'), 'utf8'));
const statements = sql
  .split(/\n(?=-- )/)
  .filter((block) => !managed.indexes.some((index) => block.includes(`DROP INDEX "${index}"`)));
const result = statements.join('\n').trim();

if (!result || result.split('\n').every((line) => line.startsWith('--') || !line.trim())) {
  process.stdout.write('Nenhuma mudança no schema.\n');
  process.exit(0);
}

// A ordem de aplicação é a ordem dos nomes: o novo prefixo precisa ser maior que o último.
const migrationsDir = join(root, 'prisma/migrations');
const last = readdirSync(migrationsDir)
  .map((entry) => entry.slice(0, 14))
  .filter((prefix) => /^\d{14}$/.test(prefix))
  .sort()
  .at(-1);
const now = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const stamp = last && now <= last ? String(BigInt(last) + 1n) : now;
const dir = join(migrationsDir, `${stamp}_${name}`);
if (existsSync(dir)) throw new Error(`Já existe: ${dir}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), `${result}\n`);
process.stdout.write(`Migration criada: prisma/migrations/${stamp}_${name}/migration.sql\n`);
