import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { OrganizationModule } from '../organization/organization.module';
import { EmployeeHistoryService } from './application/employee-history.service';
import { EmployeeImportService } from './application/employee-import.service';
import { EmployeesService } from './application/employees.service';
import { EmployeesController, MyEmployeeController } from './http/employees.controller';

/** Pessoas: funcionários, contas de acesso e importação por planilha (ADR 0010). */
@Module({
  imports: [AuthModule, FilesModule, OrganizationModule],
  controllers: [EmployeesController, MyEmployeeController],
  providers: [EmployeesService, EmployeeImportService, EmployeeHistoryService],
  exports: [EmployeesService],
})
export class WorkforceModule {}
