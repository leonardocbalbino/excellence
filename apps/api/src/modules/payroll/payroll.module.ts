import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { TimeTrackingModule } from '../time-tracking/time-tracking.module';
import { PayrollAutoGenerator } from './application/payroll-auto-generator';
import { PayrollService } from './application/payroll.service';
import { ScheduleRatesService } from './application/schedule-rates.service';
import {
  MyPayrollController,
  PayrollController,
  UnitPayController,
} from './http/payroll.controllers';

/**
 * Fechamento mensal, prévia do funcionário e exportação para a contabilidade (ADR 0017);
 * valores por plantão do posto, resumo mensal e geração na virada do mês (ADR 0020).
 */
@Module({
  imports: [OrganizationModule, TimeTrackingModule],
  controllers: [PayrollController, UnitPayController, MyPayrollController],
  providers: [PayrollService, ScheduleRatesService, PayrollAutoGenerator],
})
export class PayrollModule {}
