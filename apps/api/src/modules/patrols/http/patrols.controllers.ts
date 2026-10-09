import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  includeInactiveQuerySchema,
  type MyPatrols,
  myPatrolsSchema,
  type PatrolBoard,
  patrolBoardQuerySchema,
  patrolBoardSchema,
  patrolCheckinInputSchema,
  type PatrolPoint,
  patrolPointInputSchema,
  patrolPointSchema,
  type PatrolRoute,
  patrolRouteInputSchema,
  patrolRouteSchema,
  type PatrolRun,
  patrolRunFinishSchema,
  patrolRunSchema,
  patrolRunStartSchema,
} from '@excellence/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Idempotent } from '../../../common/idempotency/idempotency';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { PatrolPointsService } from '../application/patrol-points.service';
import { PatrolRoutesService } from '../application/patrol-routes.service';
import { type PatrolClient, PatrolRunsService } from '../application/patrol-runs.service';

const idParam = z.uuid();
type IncludeInactive = z.output<typeof includeInactiveQuerySchema>;

function clientOf(req: Request): PatrolClient {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    source: req.headers['x-client'] === 'mobile' ? 'mobile' : 'web',
  };
}

const idempotencyHeader = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Evita registro duplicado ao reenviar',
};

@ApiTags('patrols')
@ApiBearerAuth()
@Controller('patrol-points')
export class PatrolPointsController {
  constructor(private readonly points: PatrolPointsService) {}

  @Get()
  @RequirePermission('patrols:manage')
  @ZodResponse(HttpStatus.OK, z.array(patrolPointSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<PatrolPoint[]> {
    return this.points.list(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('patrols:manage')
  @ZodResponse(HttpStatus.OK, patrolPointSchema)
  get(@ZodParam('id', idParam) id: string): Promise<PatrolPoint> {
    return this.points.get(id);
  }

  @Post()
  @RequirePermission('patrols:manage')
  @ZodResponse(HttpStatus.CREATED, patrolPointSchema)
  create(
    @ZodBody(patrolPointInputSchema) body: z.output<typeof patrolPointInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolPoint> {
    return this.points.save(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('patrols:manage')
  @ZodResponse(HttpStatus.OK, patrolPointSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(patrolPointInputSchema) body: z.output<typeof patrolPointInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolPoint> {
    return this.points.save(id, body, grant);
  }

  @Post(':id/code')
  @RequirePermission('patrols:manage')
  @ApiOperation({ summary: 'Gera um novo QR code; o anterior deixa de valer' })
  @ZodResponse(HttpStatus.CREATED, patrolPointSchema)
  regenerate(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<PatrolPoint> {
    return this.points.regenerateCode(id, grant);
  }

  @Delete(':id')
  @RequirePermission('patrols:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.points.remove(id, grant);
  }
}

@ApiTags('patrols')
@ApiBearerAuth()
@Controller('patrol-routes')
export class PatrolRoutesController {
  constructor(private readonly routes: PatrolRoutesService) {}

  @Get()
  @RequirePermission('patrols:manage')
  @ZodResponse(HttpStatus.OK, z.array(patrolRouteSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<PatrolRoute[]> {
    return this.routes.list(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('patrols:manage')
  @ZodResponse(HttpStatus.OK, patrolRouteSchema)
  get(@ZodParam('id', idParam) id: string): Promise<PatrolRoute> {
    return this.routes.get(id);
  }

  @Post()
  @RequirePermission('patrols:manage')
  @ZodResponse(HttpStatus.CREATED, patrolRouteSchema)
  create(
    @ZodBody(patrolRouteInputSchema) body: z.output<typeof patrolRouteInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolRoute> {
    return this.routes.save(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('patrols:manage')
  @ZodResponse(HttpStatus.OK, patrolRouteSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(patrolRouteInputSchema) body: z.output<typeof patrolRouteInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolRoute> {
    return this.routes.save(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('patrols:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.routes.remove(id, grant);
  }
}

@ApiTags('patrols')
@ApiBearerAuth()
@Controller('me')
export class MyPatrolsController {
  constructor(private readonly runs: PatrolRunsService) {}

  @Get('patrols')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Minhas rotas, os horários de hoje e a ronda em andamento' })
  @ZodResponse(HttpStatus.OK, myPatrolsSchema)
  mine(@Access() grant: AccessGrant): Promise<MyPatrols> {
    return this.runs.mine(grant.userId);
  }

  @Post('patrol-runs')
  @AnyAuthenticated()
  @Idempotent()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ summary: 'Inicia uma ronda numa rota atribuída ao usuário' })
  @ZodResponse(HttpStatus.CREATED, patrolRunSchema)
  start(
    @ZodBody(patrolRunStartSchema) body: z.output<typeof patrolRunStartSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolRun> {
    return this.runs.start(body.routeId, grant);
  }

  @Post('patrol-runs/:id/checkins')
  @AnyAuthenticated()
  @Idempotent()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ summary: 'Registra a leitura do QR code de um ponto (horário do servidor)' })
  @ZodResponse(HttpStatus.CREATED, patrolRunSchema)
  checkin(
    @ZodParam('id', idParam) id: string,
    @ZodBody(patrolCheckinInputSchema) body: z.output<typeof patrolCheckinInputSchema>,
    @Access() grant: AccessGrant,
    @Req() req: Request,
  ): Promise<PatrolRun> {
    return this.runs.checkin(id, body, grant, clientOf(req));
  }

  @Post('patrol-runs/:id/finish')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Encerra a ronda; faltando pontos, exige o motivo' })
  @ZodResponse(HttpStatus.CREATED, patrolRunSchema)
  finish(
    @ZodParam('id', idParam) id: string,
    @ZodBody(patrolRunFinishSchema) body: z.output<typeof patrolRunFinishSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolRun> {
    return this.runs.finish(id, body.note, grant);
  }
}

@ApiTags('patrols')
@ApiBearerAuth()
@Controller('patrol-runs')
export class PatrolRunsController {
  constructor(private readonly runs: PatrolRunsService) {}

  @Get('board')
  @RequirePermission('patrols:read')
  @ApiOperation({ summary: 'Rondas e horários previstos do dia, no escopo' })
  @ZodResponse(HttpStatus.OK, patrolBoardSchema)
  board(
    @ZodQuery(patrolBoardQuerySchema) query: z.output<typeof patrolBoardQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<PatrolBoard> {
    return this.runs.board(query.date, grant);
  }

  @Get(':id')
  @RequirePermission('patrols:read')
  @ZodResponse(HttpStatus.OK, patrolRunSchema)
  get(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<PatrolRun> {
    return this.runs.get(id, grant);
  }
}
