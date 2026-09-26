-- CreateEnum
CREATE TYPE "announcement_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "announcement_read_kind" AS ENUM ('viewed', 'acknowledged');

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requires_acknowledgment" BOOLEAN NOT NULL DEFAULT false,
    "status" "announcement_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_units" (
    "announcement_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,

    CONSTRAINT "announcement_units_pkey" PRIMARY KEY ("announcement_id","unit_id")
);

-- CreateTable
CREATE TABLE "announcement_departments" (
    "announcement_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,

    CONSTRAINT "announcement_departments_pkey" PRIMARY KEY ("announcement_id","department_id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_id" UUID,
    "kind" "announcement_read_kind" NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_company_id_status_idx" ON "announcements"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "announcements_id_company_id_key" ON "announcements"("id", "company_id");

-- CreateIndex
CREATE INDEX "announcement_reads_company_id_user_id_idx" ON "announcement_reads"("company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_reads_announcement_id_user_id_kind_key" ON "announcement_reads"("announcement_id", "user_id", "kind");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_units" ADD CONSTRAINT "announcement_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_units" ADD CONSTRAINT "announcement_units_announcement_id_company_id_fkey" FOREIGN KEY ("announcement_id", "company_id") REFERENCES "announcements"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_units" ADD CONSTRAINT "announcement_units_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_departments" ADD CONSTRAINT "announcement_departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_departments" ADD CONSTRAINT "announcement_departments_announcement_id_company_id_fkey" FOREIGN KEY ("announcement_id", "company_id") REFERENCES "announcements"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_departments" ADD CONSTRAINT "announcement_departments_department_id_company_id_fkey" FOREIGN KEY ("department_id", "company_id") REFERENCES "departments"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_company_id_fkey" FOREIGN KEY ("announcement_id", "company_id") REFERENCES "announcements"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_company_id_fkey" FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Leituras e ciências são append-only (regra 2).
CREATE TRIGGER announcement_reads_append_only
  BEFORE UPDATE OR DELETE ON "announcement_reads"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER announcement_reads_no_truncate
  BEFORE TRUNCATE ON "announcement_reads"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- Publicação registra quando e por quem; arquivamento só depois de publicado.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_publication_check"
  CHECK (("status" = 'draft') = ("published_at" IS NULL AND "published_by" IS NULL));
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_archive_check"
  CHECK (("status" = 'archived') = ("archived_at" IS NOT NULL));
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_title_check"
  CHECK (length(btrim("title")) > 0 AND length(btrim("body")) > 0);

-- Publicado, o conteúdo congela: só a situação (arquivar) e a validade podem mudar, e o
-- comunicado não pode ser apagado nem voltar a rascunho.
CREATE FUNCTION announcements_freeze_published() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'announcement % is published and cannot be deleted', OLD.id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
    NEW.status = 'draft'
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.requires_acknowledgment IS DISTINCT FROM OLD.requires_acknowledgment
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR NEW.published_by IS DISTINCT FROM OLD.published_by
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
  ) THEN
    RAISE EXCEPTION 'announcement % is published and its content is frozen', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER announcements_freeze
  BEFORE UPDATE OR DELETE ON "announcements"
  FOR EACH ROW EXECUTE FUNCTION announcements_freeze_published();

-- O público também congela na publicação.
CREATE FUNCTION announcement_audience_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid := COALESCE(NEW.announcement_id, OLD.announcement_id);
BEGIN
  IF EXISTS (SELECT 1 FROM "announcements" WHERE "id" = target AND "status" <> 'draft') THEN
    RAISE EXCEPTION 'audience of published announcement % is frozen', target
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER announcement_units_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON "announcement_units"
  FOR EACH ROW EXECUTE FUNCTION announcement_audience_freeze();
CREATE TRIGGER announcement_departments_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON "announcement_departments"
  FOR EACH ROW EXECUTE FUNCTION announcement_audience_freeze();
