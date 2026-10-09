import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { PatrolPointsService } from './application/patrol-points.service';
import { PatrolRoutesService } from './application/patrol-routes.service';
import { PatrolRunsService } from './application/patrol-runs.service';
import {
  MyPatrolsController,
  PatrolPointsController,
  PatrolRoutesController,
  PatrolRunsController,
} from './http/patrols.controllers';

/** Rondas: pontos com QR, rotas, horários previstos, rondas e check-ins (ADR 0016). */
@Module({
  imports: [OrganizationModule, WorkforceModule],
  controllers: [
    PatrolPointsController,
    PatrolRoutesController,
    MyPatrolsController,
    PatrolRunsController,
  ],
  providers: [PatrolPointsService, PatrolRoutesService, PatrolRunsService],
})
export class PatrolsModule {}
