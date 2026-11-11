-- Foto de presença na ronda: o funcionário mostra que esteve no local, sem abrir ocorrência.
-- Append-only, como as leituras dos pontos.
-- CreateTable
CREATE TABLE "patrol_run_photos" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "point_id" UUID,
    "employee_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "taken_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_run_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patrol_run_photos_company_id_run_id_idx" ON "patrol_run_photos"("company_id", "run_id");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_run_photos_file_id_key" ON "patrol_run_photos"("file_id");

-- AddForeignKey
ALTER TABLE "patrol_run_photos" ADD CONSTRAINT "patrol_run_photos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_run_photos" ADD CONSTRAINT "patrol_run_photos_run_id_company_id_fkey" FOREIGN KEY ("run_id", "company_id") REFERENCES "patrol_runs"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_run_photos" ADD CONSTRAINT "patrol_run_photos_point_id_company_id_fkey" FOREIGN KEY ("point_id", "company_id") REFERENCES "patrol_points"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_run_photos" ADD CONSTRAINT "patrol_run_photos_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_run_photos" ADD CONSTRAINT "patrol_run_photos_file_id_company_id_fkey" FOREIGN KEY ("file_id", "company_id") REFERENCES "files"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Regras mantidas em SQL ────────────────────────────────────────────────────────
CREATE TRIGGER patrol_run_photos_append_only
  BEFORE UPDATE OR DELETE ON "patrol_run_photos"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER patrol_run_photos_no_truncate
  BEFORE TRUNCATE ON "patrol_run_photos"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
