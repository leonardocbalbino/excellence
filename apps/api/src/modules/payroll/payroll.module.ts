import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { TimeTrackingModule } from '../time-tracking/time-tracking.module';
import { PayrollService } from './application/payroll.service';
import { MyPayrollController, PayrollController } from './http/payroll.controllers';

/** Fechamento mensal, prévia do funcionário e exportação para a contabilidade (ADR 0017). */
@Module({
  imports: [OrganizationModule, TimeTrackingModule],
  controllers: [PayrollController, MyPayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
