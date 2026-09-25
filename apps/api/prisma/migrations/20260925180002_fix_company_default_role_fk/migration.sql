-- DropForeignKey
ALTER TABLE "companies" DROP CONSTRAINT "companies_default_employee_role_id_id_fkey";

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_default_employee_role_id_fkey" FOREIGN KEY ("default_employee_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
