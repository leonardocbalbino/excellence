-- Escalas e turnos próprios de cada posto (condomínio), valor por plantão com vigência
-- mensal e geração automática do fechamento na virada do mês (ADR 0020).

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "unit_id" UUID;

-- AlterTable
ALTER TABLE "work_schedules" ADD COLUMN     "unit_id" UUID;

-- AlterTable
ALTER TABLE "payroll_periods" ALTER COLUMN "generated_by" DROP NOT NULL;

-- CreateTable
CREATE TABLE "schedule_rates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "valid_from" CHAR(7) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schedule_rates_pkey" PRIMARY KEY ("id")
);

-- Nome único por posto, e entre os cadastros gerais (unit_id nulo).
DROP INDEX "shifts_company_id_name_key";
CREATE UNIQUE INDEX "shifts_unit_name_key" ON "shifts"("company_id", "unit_id", "name") NULLS NOT DISTINCT;

DROP INDEX "work_schedules_company_id_name_key";
CREATE UNIQUE INDEX "work_schedules_unit_name_key" ON "work_schedules"("company_id", "unit_id", "name") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "shifts_company_id_unit_id_idx" ON "shifts"("company_id", "unit_id");

-- CreateIndex
CREATE INDEX "work_schedules_company_id_unit_id_idx" ON "work_schedules"("company_id", "unit_id");

-- CreateIndex
CREATE INDEX "schedule_rates_company_id_unit_id_idx" ON "schedule_rates"("company_id", "unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_rates_unit_id_schedule_id_valid_from_key" ON "schedule_rates"("unit_id", "schedule_id", "valid_from");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rates" ADD CONSTRAINT "schedule_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rates" ADD CONSTRAINT "schedule_rates_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rates" ADD CONSTRAINT "schedule_rates_schedule_id_company_id_fkey" FOREIGN KEY ("schedule_id", "company_id") REFERENCES "work_schedules"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "schedule_rates" ADD CONSTRAINT "schedule_rates_valid_from_check"
  CHECK ("valid_from" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "schedule_rates" ADD CONSTRAINT "schedule_rates_amount_check"
  CHECK ("amount_cents" >= 0);
