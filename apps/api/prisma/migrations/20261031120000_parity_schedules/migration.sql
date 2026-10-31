-- Escala 12x36 par/ímpar: o ciclo começa no dia 1 (ímpar) ou 2 (par) de um mês de referência
-- e segue corrido (vira depois de mês de 31 dias).

-- AlterEnum
ALTER TYPE "cycle_anchor" ADD VALUE 'odd';
ALTER TYPE "cycle_anchor" ADD VALUE 'even';

-- AlterTable
ALTER TABLE "work_schedules" ADD COLUMN     "parity_month" CHAR(7);

-- Mês de referência só (e sempre) nas escalas par/ímpar. Compara como texto: o valor novo do
-- enum não pode ser usado na mesma transação em que foi criado.
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_parity_month_check" CHECK (
  ("cycle_anchor" IS NOT NULL AND "cycle_anchor"::text IN ('odd', 'even')) = ("parity_month" IS NOT NULL)
  AND ("parity_month" IS NULL OR "parity_month" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
