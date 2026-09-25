-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "default_employee_role_id" UUID,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" CITEXT,
    "cnpj" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" CHAR(2),
    "postal_code" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geofence_radius_meters" INTEGER,
    "timezone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" CITEXT,
    "unit_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "cbo" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "cnpj" TEXT,
    "base_month" SMALLINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "unions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID,
    "registration_number" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "social_name" TEXT,
    "cpf" CHAR(11) NOT NULL,
    "pis" CHAR(11),
    "birth_date" DATE,
    "email" CITEXT,
    "phone" TEXT,
    "hire_date" DATE NOT NULL,
    "termination_date" DATE,
    "unit_id" UUID NOT NULL,
    "department_id" UUID,
    "position_id" UUID,
    "union_id" UUID,
    "manager_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_company_id_code_key" ON "units"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "units_id_company_id_key" ON "units"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_company_id_code_key" ON "departments"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_id_company_id_key" ON "departments"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_company_id_name_key" ON "positions"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_id_company_id_key" ON "positions"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "unions_company_id_name_key" ON "unions"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "unions_id_company_id_key" ON "unions"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_company_id_unit_id_idx" ON "employees"("company_id", "unit_id");

-- CreateIndex
CREATE INDEX "employees_company_id_department_id_idx" ON "employees"("company_id", "department_id");

-- CreateIndex
CREATE INDEX "employees_company_id_manager_id_idx" ON "employees"("company_id", "manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_company_id_key" ON "employees"("user_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_cpf_key" ON "employees"("company_id", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_registration_number_key" ON "employees"("company_id", "registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_id_company_id_key" ON "employees"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_default_employee_role_id_id_fkey" FOREIGN KEY ("default_employee_role_id", "id") REFERENCES "roles"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_department_id_company_id_fkey" FOREIGN KEY ("department_id", "company_id") REFERENCES "departments"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unions" ADD CONSTRAINT "unions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_company_id_fkey" FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_company_id_fkey" FOREIGN KEY ("department_id", "company_id") REFERENCES "departments"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_company_id_fkey" FOREIGN KEY ("position_id", "company_id") REFERENCES "positions"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_union_id_company_id_fkey" FOREIGN KEY ("union_id", "company_id") REFERENCES "unions"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_company_id_fkey" FOREIGN KEY ("manager_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ninguém é gestor de si mesmo (ciclos maiores são barrados pela aplicação).
ALTER TABLE "employees" ADD CONSTRAINT "employees_not_own_manager" CHECK ("manager_id" IS NULL OR "manager_id" <> "id");
