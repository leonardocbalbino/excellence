import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { MedicalModule } from '../medical/medical.module';
import { OrganizationModule } from '../organization/organization.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { AdjustmentsService } from './application/adjustments.service';
import { ClockSettingsService } from './application/clock-settings.service';
import { TimeEntryWriter } from './application/time-entry-writer';
import { TimeTrackingService } from './application/time-tracking.service';
import {
  AdjustmentsController,
  ClockSettingsController,
  EmployeeTimeController,
  MyTimeController,
  TimeEntriesController,
} from './http/time-tracking.controllers';

/** Ponto: marcações append-only com hash encadeado, espelho e ajustes (ADR 0012). */
@Module({
  imports: [FilesModule, MedicalModule, OrganizationModule, SchedulingModule, WorkforceModule],
  controllers: [
    MyTimeController,
    TimeEntriesController,
    EmployeeTimeController,
    AdjustmentsController,
    ClockSettingsController,
  ],
  providers: [TimeEntryWriter, TimeTrackingService, AdjustmentsService, ClockSettingsService],
  exports: [TimeEntryWriter, TimeTrackingService],
})
export class TimeTrackingModule {}
