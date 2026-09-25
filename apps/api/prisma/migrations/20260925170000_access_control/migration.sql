-- CreateEnum
CREATE TYPE "scope_type" AS ENUM ('company', 'unit', 'department', 'own_team', 'self');

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "requires_mfa" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "company_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_key" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "role_scopes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "type" "scope_type" NOT NULL,
    "unit_id" UUID,
    "department_id" UUID,

    CONSTRAINT "role_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_company_id_name_key" ON "roles"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_company_id_key" ON "roles"("id", "company_id");

-- CreateIndex
CREATE INDEX "role_permissions_company_id_idx" ON "role_permissions"("company_id");

-- CreateIndex
CREATE INDEX "role_scopes_role_id_idx" ON "role_scopes"("role_id");

-- CreateIndex
CREATE INDEX "role_scopes_company_id_idx" ON "role_scopes"("company_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_company_id_idx" ON "user_roles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_company_id_key" ON "users"("id", "company_id");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_company_id_fkey" FOREIGN KEY ("role_id", "company_id") REFERENCES "roles"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_role_id_company_id_fkey" FOREIGN KEY ("role_id", "company_id") REFERENCES "roles"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_company_id_fkey" FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_company_id_fkey" FOREIGN KEY ("role_id", "company_id") REFERENCES "roles"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Coerência do escopo: unit_id só no tipo "unit", department_id só no tipo "department".
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_target_check" CHECK (
  ("type" = 'unit') = ("unit_id" IS NOT NULL)
  AND ("type" = 'department') = ("department_id" IS NOT NULL)
);

-- Um mesmo escopo não se repete no perfil (NULLS NOT DISTINCT trata os NULL como iguais).
CREATE UNIQUE INDEX "role_scopes_unique" ON "role_scopes" ("role_id", "type", "unit_id", "department_id") NULLS NOT DISTINCT;
