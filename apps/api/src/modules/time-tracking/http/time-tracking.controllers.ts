import { Controller, Get, HttpStatus, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Adjustment,
  adjustmentDecisionSchema,
  adjustmentInputSchema,
  adjustmentListQuerySchema,
  adjustmentSchema,
  type ClockReceipt,
  clockInputSchema,
  clockReceiptSchema,
  type ClockSettings,
  clockSettingsSchema,
  type TimeEntry,
  timeEntryListQuerySchema,
  timeEntrySchema,
  type Timesheet,
  timesheetQuerySchema,
  timesheetSchema,
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
import { AdjustmentsService } from '../application/adjustments.service';
import { ClockSettingsService } from '../application/clock-settings.service';
import { type ClientInfo, TimeTrackingService } from '../application/time-tracking.service';

const idParam = z.uuid();
type Range = z.output<typeof timeEntryListQuerySchema>;
type Month = z.output<typeof timesheetQuerySchema>;
const rangeQuery = timeEntryListQuerySchema as unknown as z.ZodObject;

function clientOf(req: Request): ClientInfo {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    source: req.headers['x-client'] === 'mobile' ? 'mobile' : 'web',
  };
}

@ApiTags('time-tracking')
@ApiBearerAuth()
@Controller('me')
export class MyTimeController {
  constructor(
    private readonly time: TimeTrackingService,
    private readonly adjustments: AdjustmentsService,
  ) {}

  @Post('time-entries')
  @AnyAuthenticated()
  @Idempotent()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Evita marcação duplicada ao reenviar',
  })
  @ApiOperation({ summary: 'Registra o ponto (horário oficial = servidor)' })
  @ZodResponse(HttpStatus.CREATED, timeEntrySchema)
  clock(
    @ZodBody(clockInputSchema) body: z.output<typeof clockInputSchema>,
    @Access() grant: AccessGrant,
    @Req() req: Request,
  ): Promise<TimeEntry> {
    return this.time.clock(grant, body, clientOf(req));
  }

  @Get('time-entries')
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.OK, z.array(timeEntrySchema))
  mine(@ZodQuery(rangeQuery) query: Range, @Access() grant: AccessGrant): Promise<TimeEntry[]> {
    return this.time.mine(grant.userId, query.from, query.to);
  }

  @Get('timesheet')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Meu espelho de ponto do mês' })
  @ZodResponse(HttpStatus.OK, timesheetSchema)
  timesheet(
    @ZodQuery(timesheetQuerySchema) query: Month,
    @Access() grant: AccessGrant,
  ): Promise<Timesheet> {
    return this.time.timesheetMine(grant.userId, query.month);
  }

  @Post('time-adjustments')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Solicita ajuste do próprio ponto' })
  @ZodResponse(HttpStatus.CREATED, adjustmentSchema)
  requestAdjustment(
    @ZodBody(adjustmentInputSchema) body: z.output<typeof adjustmentInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Adjustment> {
    return this.adjustments.requestMine(body, grant);
  }

  @Get('time-adjustments')
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.OK, z.array(adjustmentSchema))
  myAdjustments(@Access() grant: AccessGrant): Promise<Adjustment[]> {
    return this.adjustments.listMine(grant.userId);
  }

  @Post('time-adjustments/:id/cancel')
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.CREATED, adjustmentSchema)
  cancel(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<Adjustment> {
    return this.adjustments.cancel(id, grant);
  }
}

@ApiTags('time-tracking')
@ApiBearerAuth()
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly time: TimeTrackingService) {}

  @Get(':id/receipt')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Comprovante da marcação (próprio ou no escopo de time_entries:read)' })
  @ZodResponse(HttpStatus.OK, clockReceiptSchema)
  receipt(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<ClockReceipt> {
    return this.time.receipt(
      id,
      grant,
      grant.access?.permissions.has('time_entries:read') ?? false,
    );
  }
}

@ApiTags('time-tracking')
@ApiBearerAuth()
@Controller('employees/:employeeId')
export class EmployeeTimeController {
  constructor(
    private readonly time: TimeTrackingService,
    private readonly adjustments: AdjustmentsService,
  ) {}

  @Get('time-entries')
  @RequirePermission('time_entries:read')
  @ZodResponse(HttpStatus.OK, z.array(timeEntrySchema))
  entries(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodQuery(rangeQuery) query: Range,
    @Access() grant: AccessGrant,
  ): Promise<TimeEntry[]> {
    return this.time.forEmployee(employeeId, query.from, query.to, grant);
  }

  @Get('timesheet')
  @RequirePermission('time_entries:read')
  @ZodResponse(HttpStatus.OK, timesheetSchema)
  timesheet(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodQuery(timesheetQuerySchema) query: Month,
    @Access() grant: AccessGrant,
  ): Promise<Timesheet> {
    return this.time.timesheetFor(employeeId, query.month, grant);
  }

  @Get('time-entries-verification')
  @RequirePermission('time_entries:read')
  @ApiOperation({ summary: 'Confere a cadeia de hashes das marcações do funcionário' })
  verify(@ZodParam('employeeId', idParam) employeeId: string, @Access() grant: AccessGrant) {
    return this.time.verify(employeeId, grant);
  }

  @Post('time-adjustments')
  @RequirePermission('time_entries:manage')
  @ApiOperation({ summary: 'Solicita ajuste em nome do funcionário' })
  @ZodResponse(HttpStatus.CREATED, adjustmentSchema)
  request(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodBody(adjustmentInputSchema) body: z.output<typeof adjustmentInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Adjustment> {
    return this.adjustments.requestFor(employeeId, body, grant);
  }
}

@ApiTags('time-tracking')
@ApiBearerAuth()
@Controller('time-adjustments')
export class AdjustmentsController {
  constructor(private readonly adjustments: AdjustmentsService) {}

  @Get()
  @RequirePermission('time_adjustments:approve')
  @ApiOperation({ summary: 'Ajustes dos funcionários no escopo do aprovador' })
  @ZodResponse(HttpStatus.OK, z.array(adjustmentSchema))
  list(
    @ZodQuery(adjustmentListQuerySchema) query: z.output<typeof adjustmentListQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<Adjustment[]> {
    return this.adjustments.listForApprover(query.status, grant);
  }

  @Post(':id/approve')
  @RequirePermission('time_adjustments:approve')
  @ZodResponse(HttpStatus.CREATED, adjustmentSchema)
  approve(
    @ZodParam('id', idParam) id: string,
    @ZodBody(adjustmentDecisionSchema) body: z.output<typeof adjustmentDecisionSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Adjustment> {
    return this.adjustments.approve(id, body.note ?? null, grant);
  }

  @Post(':id/reject')
  @RequirePermission('time_adjustments:approve')
  @ZodResponse(HttpStatus.CREATED, adjustmentSchema)
  reject(
    @ZodParam('id', idParam) id: string,
    @ZodBody(adjustmentDecisionSchema) body: z.output<typeof adjustmentDecisionSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Adjustment> {
    return this.adjustments.reject(id, body.note ?? null, grant);
  }
}

@ApiTags('time-tracking')
@ApiBearerAuth()
@Controller('clock-settings')
export class ClockSettingsController {
  constructor(private readonly settings: ClockSettingsService) {}

  @Get()
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.OK, clockSettingsSchema)
  get(): Promise<ClockSettings> {
    return this.settings.get();
  }

  @Put()
  @RequirePermission('company:manage')
  @ZodResponse(HttpStatus.OK, clockSettingsSchema)
  update(
    @ZodBody(clockSettingsSchema) body: z.output<typeof clockSettingsSchema>,
    @Access() grant: AccessGrant,
  ): Promise<ClockSettings> {
    return this.settings.update(body, grant);
  }
}
