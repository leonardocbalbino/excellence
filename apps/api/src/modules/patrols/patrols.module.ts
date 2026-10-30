import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { PatrolOccurrencesService } from './application/patrol-occurrences.service';
import { PatrolPointsService } from './application/patrol-points.service';
import { PatrolRoutesService } from './application/patrol-routes.service';
import { PatrolRunsService } from './application/patrol-runs.service';
import {
  MyPatrolOccurrencesController,
  PatrolOccurrencesController,
  UnitPatrolSummaryController,
} from './http/patrol-occurrences.controllers';
import {
  MyPatrolsController,
  PatrolPointsController,
  PatrolRoutesController,
  PatrolRunsController,
} from './http/patrols.controllers';

/**
 * Rondas: pontos com QR, rotas, horários previstos, rondas e check-ins (ADR 0016); mínimo de
 * pontos, distância do QR, ocorrências por e-mail e resumo do mês (ADR 0024).
 */
@Module({
  imports: [FilesModule, NotificationsModule, OrganizationModule, WorkforceModule],
  controllers: [
    PatrolPointsController,
    PatrolRoutesController,
    MyPatrolsController,
    MyPatrolOccurrencesController,
    PatrolRunsController,
    PatrolOccurrencesController,
    UnitPatrolSummaryController,
  ],
  providers: [
    PatrolPointsService,
    PatrolRoutesService,
    PatrolRunsService,
    PatrolOccurrencesService,
  ],
})
export class PatrolsModule {}
