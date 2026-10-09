-- CreateEnum
CREATE TYPE "benefit_kind" AS ENUM ('transport', 'meal', 'food', 'health', 'dental', 'life_insurance', 'other');

-- CreateEnum
CREATE TYPE "payroll_status" AS ENUM ('draft', 'published', 'closed');

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "base_salary_cents" INTEGER;

-- CreateTable
CREATE TABLE "benefits" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "kind" "benefit_kind" NOT NULL,
    "provider" TEXT,
    "description" TEXT,
    "how_to_use" TEXT,
    "default_company_value_cents" INTEGER,
    "default_employee_discount_cents" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_benefits" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "benefit_id" UUID NOT NULL,
    "company_value_cents" INTEGER NOT NULL,
    "employee_discount_cents" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "useful_links" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "useful_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "payroll_status" NOT NULL DEFAULT 'draft',
    "cutoff_date" DATE NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL,
    "generated_by" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "benefits_company_id_name_key" ON "benefits"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "benefits_id_company_id_key" ON "benefits"("id", "company_id");

-- CreateIndex
CREATE INDEX "employee_benefits_company_id_employee_id_idx" ON "employee_benefits"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "employee_benefits_benefit_id_idx" ON "employee_benefits"("benefit_id");

-- CreateIndex
CREATE INDEX "useful_links_company_id_position_idx" ON "useful_links"("company_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_company_id_month_key" ON "payroll_periods"("company_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_id_company_id_key" ON "payroll_periods"("id", "company_id");

-- CreateIndex
CREATE INDEX "payroll_items_company_id_employee_id_idx" ON "payroll_items"("company_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_period_id_employee_id_key" ON "payroll_items"("period_id", "employee_id");

-- AddForeignKey
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_benefit_id_company_id_fkey" FOREIGN KEY ("benefit_id", "company_id") REFERENCES "benefits"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "useful_links" ADD CONSTRAINT "useful_links_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_period_id_company_id_fkey" FOREIGN KEY ("period_id", "company_id") REFERENCES "payroll_periods"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Regras mantidas em SQL ────────────────────────────────────────────────────────
ALTER TABLE "positions" ADD CONSTRAINT "positions_base_salary_check"
  CHECK ("base_salary_cents" IS NULL OR "base_salary_cents" >= 0);

ALTER TABLE "benefits" ADD CONSTRAINT "benefits_values_check" CHECK (
  ("default_company_value_cents" IS NULL OR "default_company_value_cents" >= 0)
  AND ("default_employee_discount_cents" IS NULL OR "default_employee_discount_cents" >= 0)
);

ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_values_check" CHECK (
  "company_value_cents" >= 0 AND "employee_discount_cents" >= 0
  AND ("end_date" IS NULL OR "end_date" >= "start_date")
);

-- O mesmo benefício nunca vale duas vezes no mesmo dia para o mesmo funcionário.
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_no_overlap"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    "benefit_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  );

ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_month_check"
  CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_status_check" CHECK (
  ("status" = 'closed') = ("closed_at" IS NOT NULL)
  AND ("status" = 'draft' OR "published_at" IS NOT NULL)
);

-- Mês fechado é definitivo: o período não muda nem é excluído, e seus itens também não.
CREATE FUNCTION payroll_period_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'payroll_periods: mês fechado não pode ser alterado'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payroll_periods_guard
  BEFORE UPDATE OR DELETE ON "payroll_periods"
  FOR EACH ROW EXECUTE FUNCTION payroll_period_guard();

CREATE FUNCTION payroll_item_guard() RETURNS trigger AS $$
DECLARE
  period_status payroll_status;
BEGIN
  SELECT "status" INTO period_status FROM "payroll_periods"
    WHERE "id" = COALESCE(NEW."period_id", OLD."period_id");
  IF period_status = 'closed' THEN
    RAISE EXCEPTION 'payroll_items: mês fechado não pode ser alterado'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payroll_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "payroll_items"
  FOR EACH ROW EXECUTE FUNCTION payroll_item_guard();
