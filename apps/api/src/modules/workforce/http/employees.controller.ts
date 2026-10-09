import { Controller, Get, Header, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  type EmployeeHistoryEvent,
  employeeHistoryEventSchema,
  createAccountInputSchema,
  type CreatedAccount,
  createdAccountSchema,
  type Employee,
  type EmployeeImportReport,
  employeeImportReportSchema,
  employeeImportRequestSchema,
  employeeInputSchema,
  employeeListQuerySchema,
  type EmployeePage,
  employeePageSchema,
  employeeSchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { EmployeeHistoryService } from '../application/employee-history.service';
import { EmployeeImportService } from '../application/employee-import.service';
import { EmployeesService } from '../application/employees.service';

const idParam = z.uuid();

@ApiTags('workforce')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly imports: EmployeeImportService,
    private readonly history: EmployeeHistoryService,
  ) {}

  @Get()
  @RequirePermission('employees:read')
  @ApiOperation({ summary: 'Funcionários no escopo do perfil, com busca e paginação' })
  @ZodResponse(HttpStatus.OK, employeePageSchema)
  list(
    @ZodQuery(employeeListQuerySchema) query: z.output<typeof employeeListQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<EmployeePage> {
    return this.employees.list(query, grant);
  }

  // Declarado antes de ":id" para não ser confundido com um id.
  @Get('imports/template')
  @RequirePermission('employees:import')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="modelo-importacao-funcionarios.csv"')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Modelo de planilha para importação' })
  template(): string {
    return this.imports.template();
  }

  @Post('imports')
  @RequirePermission('employees:import')
  @ApiOperation({ summary: 'Valida (dryRun) ou importa funcionários de uma planilha enviada' })
  @ZodResponse(HttpStatus.CREATED, employeeImportReportSchema)
  import(
    @ZodBody(employeeImportRequestSchema) body: z.output<typeof employeeImportRequestSchema>,
    @Access() grant: AccessGrant,
  ): Promise<EmployeeImportReport> {
    return this.imports.run(body.fileId, body.dryRun, grant);
  }

  @Get(':id')
  @RequirePermission('employees:read')
  @ZodResponse(HttpStatus.OK, employeeSchema)
  get(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<Employee> {
    return this.employees.get(id, grant);
  }

  @Get(':id/history')
  @RequirePermission('employees:read')
  @ApiOperation({
    summary: 'Linha do tempo do funcionário (cada fonte conforme as permissões do perfil)',
  })
  @ZodResponse(HttpStatus.OK, z.array(employeeHistoryEventSchema))
  historyOf(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<EmployeeHistoryEvent[]> {
    return this.history.history(id, grant);
  }

  @Post()
  @RequirePermission('employees:manage')
  @ZodResponse(HttpStatus.CREATED, employeeSchema)
  create(
    @ZodBody(employeeInputSchema) body: z.output<typeof employeeInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Employee> {
    return this.employees.create(body, grant);
  }

  @Put(':id')
  @RequirePermission('employees:manage')
  @ZodResponse(HttpStatus.OK, employeeSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(employeeInputSchema) body: z.output<typeof employeeInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Employee> {
    return this.employees.update(id, body, grant);
  }

  @Post(':id/account')
  @RequirePermission('employees:manage')
  @ApiOperation({ summary: 'Cria a conta de acesso com senha temporária (exibida uma vez)' })
  @ZodResponse(HttpStatus.CREATED, createdAccountSchema)
  createAccount(
    @ZodParam('id', idParam) id: string,
    @ZodBody(createAccountInputSchema) body: z.output<typeof createAccountInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<CreatedAccount> {
    return this.employees.createAccount(id, body.email, grant);
  }
}

@ApiTags('workforce')
@ApiBearerAuth()
@Controller('me')
export class MyEmployeeController {
  constructor(private readonly employees: EmployeesService) {}

  @Get('employee')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Cadastro de funcionário do usuário logado' })
  @ZodResponse(HttpStatus.OK, employeeSchema)
  mine(@Access() grant: AccessGrant): Promise<Employee> {
    return this.employees.mine(grant.userId);
  }
}
