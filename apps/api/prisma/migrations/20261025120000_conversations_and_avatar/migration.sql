-- Atendimento: chamados do funcionário com o RH, com número único por empresa, e foto de
-- perfil do usuário (ADR 0023).

-- CreateEnum
CREATE TYPE "conversation_category" AS ENUM ('occurrence', 'time_tracking', 'benefits', 'payroll', 'documents', 'other');

-- CreateEnum
CREATE TYPE "conversation_status" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "conversation_side" AS ENUM ('employee', 'hr');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_file_id" UUID;

-- CreateTable
CREATE TABLE "conversation_counters" (
    "company_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "conversation_counters_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "employee_id" UUID NOT NULL,
    "category" "conversation_category" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "conversation_status" NOT NULL DEFAULT 'open',
    "last_message_at" TIMESTAMPTZ(6) NOT NULL,
    "employee_read_at" TIMESTAMPTZ(6),
    "hr_read_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "side" "conversation_side" NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_company_id_status_last_message_at_idx" ON "conversations"("company_id", "status", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_company_id_employee_id_idx" ON "conversations"("company_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_company_id_number_key" ON "conversations"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_id_company_id_key" ON "conversations"("id", "company_id");

-- CreateIndex
CREATE INDEX "conversation_messages_company_id_conversation_id_created_at_idx" ON "conversation_messages"("company_id", "conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_company_id_fkey" FOREIGN KEY ("avatar_file_id", "company_id") REFERENCES "files"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_counters" ADD CONSTRAINT "conversation_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_company_id_fkey" FOREIGN KEY ("conversation_id", "company_id") REFERENCES "conversations"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_author_user_id_company_id_fkey" FOREIGN KEY ("author_user_id", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_attachment_file_id_company_id_fkey" FOREIGN KEY ("attachment_file_id", "company_id") REFERENCES "files"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Regras mantidas em SQL ────────────────────────────────────────────────────────
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_values_check" CHECK (
  "number" > 0
  AND length(btrim("subject")) >= 3
  AND ("status" = 'closed') = ("closed_at" IS NOT NULL)
);

ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_body_check"
  CHECK (length(btrim("body")) >= 1);

-- As mensagens são o registro do atendimento: não mudam nem somem, nem por fora da API.
CREATE FUNCTION conversation_message_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'conversation_messages: mensagens não podem ser alteradas nem excluídas'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_messages_guard
  BEFORE UPDATE OR DELETE ON "conversation_messages"
  FOR EACH ROW EXECUTE FUNCTION conversation_message_guard();
