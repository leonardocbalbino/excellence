import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Holiday,
  holidayInputSchema,
  holidayListQuerySchema,
  holidaySchema,
  includeInactiveQuerySchema,
  type PlannedDay,
  plannedDaySchema,
  plannedRangeQuerySchema,
  type ScheduleAssignment,
  scheduleAssignmentInputSchema,
  scheduleAssignmentSchema,
  type Shift,
  shiftInputSchema,
  shiftSchema,
  type WorkSchedule,
  workScheduleInputSchema,
  workScheduleSchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { AssignmentsService } from '../application/assignments.service';
import { HolidaysService } from '../application/holidays.service';
import { ShiftsService } from '../application/shifts.service';
import { WorkSchedulesService } from '../application/work-schedules.service';
import { nationalHolidaySuggestions } from '../domain/national-holidays';

const idParam = z.uuid();
type IncludeInactive = z.output<typeof includeInactiveQuerySchema>;
type Range = z.output<typeof plannedRangeQuerySchema>;

@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  @RequirePermission('schedules:read')
  @ZodResponse(HttpStatus.OK, z.array(shiftSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<Shift[]> {
    return this.shifts.list(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('schedules:read')
  @ZodResponse(HttpStatus.OK, shiftSchema)
  get(@ZodParam('id', idParam) id: string): Promise<Shift> {
    return this.shifts.get(id);
  }

  @Post()
  @RequirePermission('schedules:manage')
  @ZodResponse(HttpStatus.CREATED, shiftSchema)
  create(
    @ZodBody(shiftInputSchema) body: z.output<typeof shiftInputSchema>,
    @Access() grant: AccessGrant,
  ) {
    return this.shifts.save(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('schedules:manage')
  @ZodResponse(HttpStatus.OK, shiftSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(shiftInputSchema) body: z.output<typeof shiftInputSchema>,
    @Access() grant: AccessGrant,
  ) {
    return this.shifts.save(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('schedules:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.shifts.remove(id, grant);
  }
}

@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('work-schedules')
export class WorkSchedulesController {
  constructor(private readonly schedules: WorkSchedulesService) {}

  @Get()
  @RequirePermission('schedules:read')
  @ZodResponse(HttpStatus.OK, z.array(workScheduleSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<WorkSchedule[]> {
    return this.schedules.list(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('schedules:read')
  @ZodResponse(HttpStatus.OK, workScheduleSchema)
  get(@ZodParam('id', idParam) id: string): Promise<WorkSchedule> {
    return this.schedules.get(id);
  }

  @Post()
  @RequirePermission('schedules:manage')
  @ZodResponse(HttpStatus.CREATED, workScheduleSchema)
  create(
    @ZodBody(workScheduleInputSchema) body: z.output<typeof workScheduleInputSchema>,
    @Access() grant: AccessGrant,
  ) {
    return this.schedules.save(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('schedules:manage')
  @ZodResponse(HttpStatus.OK, workScheduleSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(workScheduleInputSchema) body: z.output<typeof workScheduleInputSchema>,
    @Access() grant: AccessGrant,
  ) {
    return this.schedules.save(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('schedules:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.schedules.remove(id, grant);
  }
}

const suggestionSchema = z.object({ date: z.string(), name: z.string(), legalBasis: z.string() });

@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get()
  @RequirePermission('schedules:read')
  @ZodResponse(HttpStatus.OK, z.array(holidaySchema))
  list(
    @ZodQuery(holidayListQuerySchema) query: z.output<typeof holidayListQuerySchema>,
  ): Promise<Holiday[]> {
    return this.holidays.list(query.year);
  }

  @Get('national-suggestions')
  @RequirePermission('schedules:manage')
  @ApiOperation({ summary: 'Feriados nacionais de data fixa (lei federal) para conferência' })
  @ZodResponse(HttpStatus.OK, z.array(suggestionSchema))
  suggestions(@ZodQuery(holidayListQuerySchema) query: z.output<typeof holidayListQuerySchema>) {
    return nationalHolidaySuggestions(query.year);
  }

  @Post()
  @RequirePermission('schedules:manage')
  @ZodResponse(HttpStatus.CREATED, holidaySchema)
  create(
    @ZodBody(holidayInputSchema) body: z.output<typeof holidayInputSchema>,
    @Access() grant: AccessGrant,
  ) {
    return this.holidays.save(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('schedules:manage')
  @ZodResponse(HttpStatus.OK, holidaySchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(holidayInputSchema) body: z.output<typeof holidayInputSchema>,
    @Access() grant: AccessGrant,
  ) {
    return this.holidays.save(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('schedules:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.holidays.remove(id, grant);
  }
}

@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('employees/:employeeId')
export class EmployeeScheduleController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('schedule-assignments')
  @RequirePermission('employees:read')
  @ZodResponse(HttpStatus.OK, z.array(scheduleAssignmentSchema))
  list(
    @ZodParam('employeeId', idParam) employeeId: string,
    @Access() grant: AccessGrant,
  ): Promise<ScheduleAssignment[]> {
    return this.assignments.list(employeeId, grant);
  }

  @Post('schedule-assignments')
  @RequirePermission('schedules:assign')
  @ApiOperation({ summary: 'Vincula o funcionário a uma escala a partir de uma data' })
  @ZodResponse(HttpStatus.CREATED, scheduleAssignmentSchema)
  assign(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodBody(scheduleAssignmentInputSchema) body: z.output<typeof scheduleAssignmentInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<ScheduleAssignment> {
    return this.assignments.assign(employeeId, body, grant);
  }

  @Delete('schedule-assignments/:assignmentId')
  @RequirePermission('schedules:assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um vínculo que ainda não começou' })
  remove(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodParam('assignmentId', idParam) assignmentId: string,
    @Access() grant: AccessGrant,
  ): Promise<void> {
    return this.assignments.remove(employeeId, assignmentId, grant);
  }

  @Get('planned-schedule')
  @RequirePermission('employees:read')
  @ApiOperation({ summary: 'Escala prevista dia a dia (turnos e feriados)' })
  @ZodResponse(HttpStatus.OK, z.array(plannedDaySchema))
  planned(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodQuery(plannedRangeQuerySchema) query: Range,
    @Access() grant: AccessGrant,
  ): Promise<PlannedDay[]> {
    return this.assignments.planned(employeeId, query.from, query.to, grant);
  }
}

@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('me')
export class MyScheduleController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('planned-schedule')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Minha escala prevista' })
  @ZodResponse(HttpStatus.OK, z.array(plannedDaySchema))
  mine(
    @ZodQuery(plannedRangeQuerySchema) query: Range,
    @Access() grant: AccessGrant,
  ): Promise<PlannedDay[]> {
    return this.assignments.mine(grant.userId, query.from, query.to);
  }
}
