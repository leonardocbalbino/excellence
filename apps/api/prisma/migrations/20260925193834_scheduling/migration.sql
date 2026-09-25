-- CreateEnum
CREATE TYPE "schedule_kind" AS ENUM ('cycle', 'flexible');

-- CreateEnum
CREATE TYPE "cycle_anchor" AS ENUM ('monday', 'assignment');

-- CreateEnum
CREATE TYPE "holiday_scope" AS ENUM ('national', 'state', 'city', 'company', 'unit');

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" TEXT,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "break_minutes" SMALLINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" TEXT,
    "kind" "schedule_kind" NOT NULL,
    "cycle_anchor" "cycle_anchor",
    "weekly_minutes" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule_days" (
    "company_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "day_index" SMALLINT NOT NULL,
    "shift_id" UUID,

    CONSTRAINT "work_schedule_days_pkey" PRIMARY KEY ("schedule_id","day_index")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "holiday_scope" NOT NULL,
    "state" CHAR(2),
    "city" CITEXT,
    "unit_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedule_assignments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "cycle_start_date" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shifts_company_id_name_key" ON "shifts"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_id_company_id_key" ON "shifts"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_company_id_name_key" ON "work_schedules"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_id_company_id_key" ON "work_schedules"("id", "company_id");

-- CreateIndex
CREATE INDEX "work_schedule_days_company_id_idx" ON "work_schedule_days"("company_id");

-- CreateIndex
CREATE INDEX "holidays_company_id_date_idx" ON "holidays"("company_id", "date");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_company_id_employee_id_start__idx" ON "employee_schedule_assignments"("company_id", "employee_id", "start_date");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_schedule_id_idx" ON "employee_schedule_assignments"("schedule_id");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_days" ADD CONSTRAINT "work_schedule_days_schedule_id_company_id_fkey" FOREIGN KEY ("schedule_id", "company_id") REFERENCES "work_schedules"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_days" ADD CONSTRAINT "work_schedule_days_shift_id_company_id_fkey" FOREIGN KEY ("shift_id", "company_id") REFERENCES "shifts"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_schedule_id_company_id_fkey" FOREIGN KEY ("schedule_id", "company_id") REFERENCES "work_schedules"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Regras de integridade mantidas em SQL ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "shifts" ADD CONSTRAINT "shifts_minutes_check" CHECK (
  "start_minute" BETWEEN 0 AND 1439
  AND "end_minute" BETWEEN 0 AND 1439
  AND "start_minute" <> "end_minute"
  AND "break_minutes" >= 0
);

ALTER TABLE "work_schedule_days" ADD CONSTRAINT "work_schedule_days_index_check" CHECK ("day_index" >= 0);

-- Abrangência coerente: UF só em estadual/municipal, município só em municipal, unidade só em "unit".
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_scope_check" CHECK (
  ("scope" IN ('state', 'city')) = ("state" IS NOT NULL)
  AND ("scope" = 'city') = ("city" IS NOT NULL)
  AND ("scope" = 'unit') = ("unit_id" IS NOT NULL)
);

ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_dates_check"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- Um funcionário nunca está em duas escalas no mesmo dia.
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_no_overlap"
  EXCLUDE USING gist ("employee_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&);
