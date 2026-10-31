import { Controller, Get, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type DownloadLink,
  downloadLinkSchema,
  type PatrolOccurrence,
  patrolOccurrenceInputSchema,
  patrolOccurrenceListQuerySchema,
  patrolOccurrenceResolutionSchema,
  patrolOccurrenceSchema,
  type UnitPatrolSummary,
  unitMonthlySummaryQuerySchema,
  unitPatrolSummarySchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { PatrolOccurrencesService } from '../application/patrol-occurrences.service';

const idParam = z.uuid();

/** Ocorrência registrada pelo próprio funcionário durante a ronda (ADR 0024). */
@ApiTags('patrols')
@ApiBearerAuth()
@Controller('me/patrol-runs')
export class MyPatrolOccurrencesController {
  constructor(private readonly occurrences: PatrolOccurrencesService) {}

  @Post(':id/occurrences')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Registra uma ocorrência na ronda (número único; vai por e-mail)' })
  @ZodResponse(HttpStatus.CREATED, patrolOccurrenceSchema)
  report(
    @ZodParam('id', idParam) id: string,
    @ZodBody(patrolOccurrenceInputSchema) body: z.output<typeof patrolOccurrenceInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolOccurrence> {
    return this.occurrences.report(id, body, grant);
  }
}

/** Ocorrências na gestão: consulta no escopo de `patrols:read`, resolução com `patrols:manage`. */
@ApiTags('patrols')
@ApiBearerAuth()
@Controller('patrol-occurrences')
export class PatrolOccurrencesController {
  constructor(private readonly occurrences: PatrolOccurrencesService) {}

  @Get()
  @RequirePermission('patrols:read')
  @ZodResponse(HttpStatus.OK, z.array(patrolOccurrenceSchema))
  list(
    @ZodQuery(patrolOccurrenceListQuerySchema)
    query: z.output<typeof patrolOccurrenceListQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolOccurrence[]> {
    return this.occurrences.list(query, grant);
  }

  @Get(':id')
  @RequirePermission('patrols:read')
  @ZodResponse(HttpStatus.OK, patrolOccurrenceSchema)
  get(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<PatrolOccurrence> {
    return this.occurrences.get(id, grant);
  }

  @Get(':id/photo')
  @RequirePermission('patrols:read')
  @ApiOperation({ summary: 'Link temporário da foto da ocorrência' })
  @ZodResponse(HttpStatus.OK, downloadLinkSchema)
  photo(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<DownloadLink> {
    return this.occurrences.photo(id, grant);
  }

  @Put(':id/resolution')
  @RequirePermission('patrols:manage')
  @ApiOperation({ summary: 'O que foi feito e a resolução (com resolução, fica resolvida)' })
  @ZodResponse(HttpStatus.OK, patrolOccurrenceSchema)
  resolve(
    @ZodParam('id', idParam) id: string,
    @ZodBody(patrolOccurrenceResolutionSchema)
    body: z.output<typeof patrolOccurrenceResolutionSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolOccurrence> {
    return this.occurrences.resolve(id, body, grant);
  }

  @Post(':id/email')
  @RequirePermission('patrols:manage')
  @ApiOperation({ summary: 'Reenvia o e-mail aos destinatários atuais do posto' })
  @ZodResponse(HttpStatus.CREATED, patrolOccurrenceSchema)
  resend(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<PatrolOccurrence> {
    return this.occurrences.resend(id, grant);
  }
}

/** Pasta do posto: resumo do mês das rondas e ocorrências (ADR 0024). */
@ApiTags('patrols')
@ApiBearerAuth()
@Controller('units/:unitId/patrol-summary')
export class UnitPatrolSummaryController {
  constructor(private readonly occurrences: PatrolOccurrencesService) {}

  @Get()
  @RequirePermission('patrols:read')
  @ApiOperation({ summary: 'Rondas do mês no posto: previstas, feitas, perdidas e ocorrências' })
  @ZodResponse(HttpStatus.OK, unitPatrolSummarySchema)
  summary(
    @ZodParam('unitId', idParam) unitId: string,
    @ZodQuery(unitMonthlySummaryQuerySchema) query: z.output<typeof unitMonthlySummaryQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<UnitPatrolSummary> {
    return this.occurrences.unitSummary(unitId, query.month, grant);
  }
}
