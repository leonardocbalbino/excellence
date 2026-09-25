import { Module } from '@nestjs/common';
import { OrganizationModule } from './organization/organization.module';
import { WorkforceModule } from './workforce/workforce.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { TimeTrackingModule } from './time-tracking/time-tracking.module';
import { AbsencesModule } from './absences/absences.module';
import { PatrolsModule } from './patrols/patrols.module';
import { CommunicationModule } from './communication/communication.module';
import { NormativeModule } from './normative/normative.module';
import { DisciplinaryModule } from './disciplinary/disciplinary.module';
import { DocumentsModule } from './documents/documents.module';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { AccessControlModule } from './access-control/access-control.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FilesModule } from './files/files.module';

/** Agrega os módulos de domínio. Cada um é preenchido na etapa correspondente. */
@Module({
  imports: [
    OrganizationModule,
    WorkforceModule,
    SchedulingModule,
    TimeTrackingModule,
    AbsencesModule,
    PatrolsModule,
    CommunicationModule,
    NormativeModule,
    DisciplinaryModule,
    DocumentsModule,
    ReportsModule,
    AuthModule,
    AccessControlModule,
    AuditModule,
    NotificationsModule,
    FilesModule,
  ],
})
export class DomainModule {}
