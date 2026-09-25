import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { AssignmentsService } from './application/assignments.service';
import { HolidaysService } from './application/holidays.service';
import { ShiftsService } from './application/shifts.service';
import { WorkSchedulesService } from './application/work-schedules.service';
import {
  EmployeeScheduleController,
  HolidaysController,
  MyScheduleController,
  ShiftsController,
  WorkSchedulesController,
} from './http/scheduling.controllers';

/** Jornada: turnos, escalas, feriados e vínculo funcionário-escala (ADR 0011). */
@Module({
  imports: [OrganizationModule, WorkforceModule],
  controllers: [
    ShiftsController,
    WorkSchedulesController,
    HolidaysController,
    EmployeeScheduleController,
    MyScheduleController,
  ],
  providers: [ShiftsService, WorkSchedulesService, HolidaysService, AssignmentsService],
  exports: [AssignmentsService],
})
export class SchedulingModule {}
