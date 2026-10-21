-- VA/VT calculados por dia pelo ponto, com exceções do RH antes do fechamento (ADR 0021).

-- CreateEnum
CREATE TYPE "benefit_calculation" AS ENUM ('monthly', 'per_worked_day', 'per_worked_or_justified_day');

-- AlterTable
ALTER TABLE "benefits" ADD COLUMN     "calculation" "benefit_calculation" NOT NULL DEFAULT 'monthly',
ADD COLUMN     "default_daily_value_cents" INTEGER;

-- AlterTable
ALTER TABLE "employee_benefits" ADD COLUMN     "daily_value_cents" INTEGER;

-- CreateTable
CREATE TABLE "benefit_day_adjustments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "kind" "benefit_kind" NOT NULL,
    "days" SMALLINT,
    "daily_value_cents" INTEGER,
    "reason" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "benefit_day_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "benefit_day_adjustments_company_id_month_idx" ON "benefit_day_adjustments"("company_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_day_adjustments_employee_id_month_kind_key" ON "benefit_day_adjustments"("employee_id", "month", "kind");

-- AddForeignKey
ALTER TABLE "benefit_day_adjustments" ADD CONSTRAINT "benefit_day_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_day_adjustments" ADD CONSTRAINT "benefit_day_adjustments_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Regras mantidas em SQL ────────────────────────────────────────────────────────
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_daily_check" CHECK (
  ("default_daily_value_cents" IS NULL OR "default_daily_value_cents" >= 0)
  AND ("calculation" = 'monthly' OR "kind" IN ('food', 'transport'))
);

ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_daily_value_check"
  CHECK ("daily_value_cents" IS NULL OR "daily_value_cents" >= 0);

ALTER TABLE "benefit_day_adjustments" ADD CONSTRAINT "benefit_day_adjustments_values_check" CHECK (
  "month" ~ '^\d{4}-(0[1-9]|1[0-2])$'
  AND "kind" IN ('food', 'transport')
  AND ("days" IS NOT NULL OR "daily_value_cents" IS NOT NULL)
  AND ("days" IS NULL OR "days" BETWEEN 0 AND 31)
  AND ("daily_value_cents" IS NULL OR "daily_value_cents" >= 0)
);

-- Mês fechado na folha: as exceções do mês não mudam mais (nem por fora da API).
CREATE FUNCTION benefit_day_adjustment_guard() RETURNS trigger AS $$
DECLARE
  period_status payroll_status;
BEGIN
  SELECT "status" INTO period_status FROM "payroll_periods"
    WHERE "company_id" = COALESCE(NEW."company_id", OLD."company_id")
      AND "month" = COALESCE(NEW."month", OLD."month");
  IF period_status = 'closed' THEN
    RAISE EXCEPTION 'benefit_day_adjustments: mês fechado não pode ser alterado'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD."company_id", OLD."month") IS DISTINCT FROM (NEW."company_id", NEW."month") THEN
    SELECT "status" INTO period_status FROM "payroll_periods"
      WHERE "company_id" = OLD."company_id" AND "month" = OLD."month";
    IF period_status = 'closed' THEN
      RAISE EXCEPTION 'benefit_day_adjustments: mês fechado não pode ser alterado'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER benefit_day_adjustments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "benefit_day_adjustments"
  FOR EACH ROW EXECUTE FUNCTION benefit_day_adjustment_guard();
