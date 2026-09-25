import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  type Company,
  companyInputSchema,
  companySchema,
  type Department,
  departmentInputSchema,
  departmentSchema,
  includeInactiveQuerySchema,
  type LaborUnion,
  laborUnionInputSchema,
  laborUnionSchema,
  type Position,
  positionInputSchema,
  positionSchema,
  type Unit,
  unitInputSchema,
  unitSchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { CatalogsService } from '../application/catalogs.service';
import { CompanyService } from '../application/company.service';
import { UnitsService } from '../application/units.service';

type IncludeInactive = z.output<typeof includeInactiveQuerySchema>;
const idParam = z.uuid();

@ApiTags('organization')
@ApiBearerAuth()
@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.OK, companySchema)
  get(): Promise<Company> {
    return this.company.get();
  }

  @Put()
  @RequirePermission('company:manage')
  @ZodResponse(HttpStatus.OK, companySchema)
  update(
    @ZodBody(companyInputSchema) body: z.output<typeof companyInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Company> {
    return this.company.update(body, grant);
  }
}

@ApiTags('organization')
@ApiBearerAuth()
@Controller('units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  @RequirePermission('units:read')
  @ZodResponse(HttpStatus.OK, z.array(unitSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<Unit[]> {
    return this.units.list(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('units:read')
  @ZodResponse(HttpStatus.OK, unitSchema)
  get(@ZodParam('id', idParam) id: string): Promise<Unit> {
    return this.units.get(id);
  }

  @Post()
  @RequirePermission('units:manage')
  @ZodResponse(HttpStatus.CREATED, unitSchema)
  create(
    @ZodBody(unitInputSchema) body: z.output<typeof unitInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Unit> {
    return this.units.create(body, grant);
  }

  @Put(':id')
  @RequirePermission('units:manage')
  @ZodResponse(HttpStatus.OK, unitSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(unitInputSchema) body: z.output<typeof unitInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Unit> {
    return this.units.update(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('units:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.units.remove(id, grant);
  }
}

@ApiTags('organization')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  @RequirePermission('departments:read')
  @ZodResponse(HttpStatus.OK, z.array(departmentSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<Department[]> {
    return this.catalogs.listDepartments(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('departments:read')
  @ZodResponse(HttpStatus.OK, departmentSchema)
  get(@ZodParam('id', idParam) id: string): Promise<Department> {
    return this.catalogs.getDepartment(id);
  }

  @Post()
  @RequirePermission('departments:manage')
  @ZodResponse(HttpStatus.CREATED, departmentSchema)
  create(
    @ZodBody(departmentInputSchema) body: z.output<typeof departmentInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Department> {
    return this.catalogs.saveDepartment(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('departments:manage')
  @ZodResponse(HttpStatus.OK, departmentSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(departmentInputSchema) body: z.output<typeof departmentInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Department> {
    return this.catalogs.saveDepartment(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('departments:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.catalogs.removeDepartment(id, grant);
  }
}

@ApiTags('organization')
@ApiBearerAuth()
@Controller('positions')
export class PositionsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  @RequirePermission('positions:read')
  @ZodResponse(HttpStatus.OK, z.array(positionSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<Position[]> {
    return this.catalogs.listPositions(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('positions:read')
  @ZodResponse(HttpStatus.OK, positionSchema)
  get(@ZodParam('id', idParam) id: string): Promise<Position> {
    return this.catalogs.getPosition(id);
  }

  @Post()
  @RequirePermission('positions:manage')
  @ZodResponse(HttpStatus.CREATED, positionSchema)
  create(
    @ZodBody(positionInputSchema) body: z.output<typeof positionInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Position> {
    return this.catalogs.savePosition(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('positions:manage')
  @ZodResponse(HttpStatus.OK, positionSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(positionInputSchema) body: z.output<typeof positionInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Position> {
    return this.catalogs.savePosition(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('positions:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.catalogs.removePosition(id, grant);
  }
}

@ApiTags('organization')
@ApiBearerAuth()
@Controller('unions')
export class UnionsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  @RequirePermission('unions:read')
  @ZodResponse(HttpStatus.OK, z.array(laborUnionSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<LaborUnion[]> {
    return this.catalogs.listUnions(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('unions:read')
  @ZodResponse(HttpStatus.OK, laborUnionSchema)
  get(@ZodParam('id', idParam) id: string): Promise<LaborUnion> {
    return this.catalogs.getUnion(id);
  }

  @Post()
  @RequirePermission('unions:manage')
  @ZodResponse(HttpStatus.CREATED, laborUnionSchema)
  create(
    @ZodBody(laborUnionInputSchema) body: z.output<typeof laborUnionInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<LaborUnion> {
    return this.catalogs.saveUnion(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('unions:manage')
  @ZodResponse(HttpStatus.OK, laborUnionSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(laborUnionInputSchema) body: z.output<typeof laborUnionInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<LaborUnion> {
    return this.catalogs.saveUnion(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('unions:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.catalogs.removeUnion(id, grant);
  }
}
