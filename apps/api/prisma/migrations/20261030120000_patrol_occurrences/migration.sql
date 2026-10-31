-- Rondas: mínimo de pontos por rota, ocorrências numeradas com resolução e e-mails do posto
-- que recebem as ocorrências (ADR 0024).

-- CreateEnum
CREATE TYPE "patrol_occurrence_status" AS ENUM ('open', 'resolved');

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "occurrence_emails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "patrol_routes" ADD COLUMN     "min_points" SMALLINT;

-- AlterTable
ALTER TABLE "patrol_runs" ADD COLUMN     "min_points" SMALLINT;

-- CreateTable
CREATE TABLE "occurrence_counters" (
    "company_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "occurrence_counters_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "patrol_occurrences" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "unit_id" UUID NOT NULL,
    "run_id" UUID,
    "point_id" UUID,
    "employee_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "description" TEXT NOT NULL,
    "photo_file_id" UUID,
    "status" "patrol_occurrence_status" NOT NULL DEFAULT 'open',
    "action_taken" TEXT,
    "resolution" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "emailed_at" TIMESTAMPTZ(6),
    "email_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patrol_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patrol_occurrences_company_id_unit_id_occurred_at_idx" ON "patrol_occurrences"("company_id", "unit_id", "occurred_at");

-- CreateIndex
CREATE INDEX "patrol_occurrences_company_id_status_idx" ON "patrol_occurrences"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_occurrences_company_id_number_key" ON "patrol_occurrences"("company_id", "number");

-- AddForeignKey
ALTER TABLE "occurrence_counters" ADD CONSTRAINT "occurrence_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_occurrences" ADD CONSTRAINT "patrol_occurrences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_occurrences" ADD CONSTRAINT "patrol_occurrences_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_occurrences" ADD CONSTRAINT "patrol_occurrences_run_id_company_id_fkey" FOREIGN KEY ("run_id", "company_id") REFERENCES "patrol_runs"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_occurrences" ADD CONSTRAINT "patrol_occurrences_point_id_company_id_fkey" FOREIGN KEY ("point_id", "company_id") REFERENCES "patrol_points"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_occurrences" ADD CONSTRAINT "patrol_occurrences_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_occurrences" ADD CONSTRAINT "patrol_occurrences_photo_file_id_company_id_fkey" FOREIGN KEY ("photo_file_id", "company_id") REFERENCES "files"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_occurrences" ADD CONSTRAINT "patrol_occurrences_resolved_by_company_id_fkey" FOREIGN KEY ("resolved_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Regras mantidas em SQL ────────────────────────────────────────────────────────
ALTER TABLE "patrol_routes" ADD CONSTRAINT "patrol_routes_min_points_check"
  CHECK ("min_points" IS NULL OR "min_points" >= 1);

ALTER TABLE "patrol_occurrences" ADD CONSTRAINT "patrol_occurrences_values_check" CHECK (
  "number" > 0
  AND length(btrim("description")) >= 5
  AND ("status" = 'resolved') = ("resolved_at" IS NOT NULL)
);

-- O registro do funcionário (o que, onde, quando e a foto) não muda nem some; a
-- administração só completa o que foi feito, a resolução e o envio por e-mail.
CREATE FUNCTION patrol_occurrence_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'patrol_occurrences: ocorrências não podem ser excluídas'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."number", NEW."unit_id", NEW."run_id", NEW."point_id", NEW."employee_id",
      NEW."occurred_at", NEW."description", NEW."photo_file_id", NEW."company_id")
     IS DISTINCT FROM
     (OLD."number", OLD."unit_id", OLD."run_id", OLD."point_id", OLD."employee_id",
      OLD."occurred_at", OLD."description", OLD."photo_file_id", OLD."company_id") THEN
    RAISE EXCEPTION 'patrol_occurrences: o registro da ocorrência não pode ser alterado'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patrol_occurrences_guard
  BEFORE UPDATE OR DELETE ON "patrol_occurrences"
  FOR EACH ROW EXECUTE FUNCTION patrol_occurrence_guard();
