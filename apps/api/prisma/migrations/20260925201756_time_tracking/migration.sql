-- CreateEnum
CREATE TYPE "clock_outside_geofence" AS ENUM ('allow', 'block');

-- CreateEnum
CREATE TYPE "time_entry_kind" AS ENUM ('clock', 'inclusion', 'disregard');

-- CreateEnum
CREATE TYPE "geofence_status" AS ENUM ('inside', 'outside', 'no_location', 'no_fence');

-- CreateEnum
CREATE TYPE "adjustment_type" AS ENUM ('include', 'disregard');

-- CreateEnum
CREATE TYPE "adjustment_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "clock_settings" (
    "company_id" UUID NOT NULL,
    "outside_geofence" "clock_outside_geofence" NOT NULL DEFAULT 'allow',
    "require_location" BOOLEAN NOT NULL DEFAULT false,
    "require_selfie" BOOLEAN NOT NULL DEFAULT false,
    "overnight_grace_minutes" SMALLINT NOT NULL DEFAULT 240,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clock_settings_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "nsr_counters" (
    "company_id" UUID NOT NULL,
    "last_nsr" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "nsr_counters_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "nsr" BIGINT NOT NULL,
    "kind" "time_entry_kind" NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "device_recorded_at" TIMESTAMPTZ(6),
    "references_entry_id" UUID,
    "adjustment_request_id" UUID,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "distance_meters" DOUBLE PRECISION,
    "geofence_status" "geofence_status" NOT NULL,
    "selfie_file_id" UUID,
    "source" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_by" UUID NOT NULL,
    "previous_hash" TEXT,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_adjustment_requests" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "adjustment_type" NOT NULL,
    "proposed_at" TIMESTAMPTZ(6),
    "target_entry_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "adjustment_status" NOT NULL DEFAULT 'pending',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "result_entry_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "time_adjustment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_hash_key" ON "time_entries"("hash");

-- CreateIndex
CREATE INDEX "time_entries_company_id_employee_id_recorded_at_idx" ON "time_entries"("company_id", "employee_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_company_id_nsr_key" ON "time_entries"("company_id", "nsr");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_id_company_id_key" ON "time_entries"("id", "company_id");

-- CreateIndex
CREATE INDEX "time_adjustment_requests_company_id_status_idx" ON "time_adjustment_requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "time_adjustment_requests_company_id_employee_id_idx" ON "time_adjustment_requests"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_company_id_user_id_key_key" ON "idempotency_keys"("company_id", "user_id", "key");

-- AddForeignKey
ALTER TABLE "clock_settings" ADD CONSTRAINT "clock_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nsr_counters" ADD CONSTRAINT "nsr_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_references_entry_id_company_id_fkey" FOREIGN KEY ("references_entry_id", "company_id") REFERENCES "time_entries"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjustment_requests" ADD CONSTRAINT "time_adjustment_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_adjustment_requests" ADD CONSTRAINT "time_adjustment_requests_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Regras mantidas em SQL ────────────────────────────────────────────────────────
-- Marcações são append-only (regra 2): correções são novos registros.
CREATE TRIGGER time_entries_append_only
  BEFORE UPDATE OR DELETE ON "time_entries"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER time_entries_no_truncate
  BEFORE TRUNCATE ON "time_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Desconsideração sempre aponta a marcação original; os demais tipos, nunca.
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_reference_check" CHECK (
  ("kind" = 'disregard') = ("references_entry_id" IS NOT NULL)
);

-- Uma marcação só pode ser desconsiderada uma vez.
CREATE UNIQUE INDEX "time_entries_single_disregard"
  ON "time_entries" ("references_entry_id") WHERE "kind" = 'disregard';

-- Solicitação coerente com o tipo.
ALTER TABLE "time_adjustment_requests" ADD CONSTRAINT "time_adjustment_requests_type_check" CHECK (
  ("type" = 'include') = ("proposed_at" IS NOT NULL)
  AND ("type" = 'disregard') = ("target_entry_id" IS NOT NULL)
);
