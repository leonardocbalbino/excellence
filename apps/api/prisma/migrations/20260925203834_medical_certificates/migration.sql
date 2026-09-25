-- CreateEnum
CREATE TYPE "medical_certificate_status" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "medical_certificates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "issuer_name" TEXT,
    "issuer_registry" TEXT,
    "cid" TEXT,
    "notes" TEXT,
    "status" "medical_certificate_status" NOT NULL DEFAULT 'pending',
    "submitted_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "medical_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medical_certificates_file_id_key" ON "medical_certificates"("file_id");

-- CreateIndex
CREATE INDEX "medical_certificates_company_id_status_idx" ON "medical_certificates"("company_id", "status");

-- CreateIndex
CREATE INDEX "medical_certificates_company_id_employee_id_start_date_idx" ON "medical_certificates"("company_id", "employee_id", "start_date");

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_file_id_company_id_fkey" FOREIGN KEY ("file_id", "company_id") REFERENCES "files"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Período válido; horário parcial só em atestado de um dia, com início antes do fim.
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_period_check"
  CHECK ("end_date" >= "start_date");
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_partial_check"
  CHECK (
    ("start_minute" IS NULL AND "end_minute" IS NULL)
    OR (
      "start_date" = "end_date"
      AND "start_minute" BETWEEN 0 AND 1439
      AND "end_minute" BETWEEN 1 AND 1440
      AND "start_minute" < "end_minute"
    )
  );
-- Decisão registrada junto com o status.
ALTER TABLE "medical_certificates" ADD CONSTRAINT "medical_certificates_review_check"
  CHECK (("status" IN ('accepted', 'rejected')) = ("reviewed_by" IS NOT NULL));
