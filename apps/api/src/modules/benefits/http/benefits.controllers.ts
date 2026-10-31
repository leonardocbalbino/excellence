import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Benefit,
  benefitInputSchema,
  benefitSchema,
  type EmployeeBenefit,
  employeeBenefitInputSchema,
  employeeBenefitSchema,
  includeInactiveQuerySchema,
  type MyBenefit,
  myBenefitSchema,
  type UsefulLink,
  usefulLinkInputSchema,
  usefulLinkSchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { BenefitsService } from '../application/benefits.service';
import { UsefulLinksService } from '../application/useful-links.service';

const idParam = z.uuid();
type IncludeInactive = z.output<typeof includeInactiveQuerySchema>;
type AssignmentBody = z.output<typeof employeeBenefitInputSchema>;

@ApiTags('benefits')
@ApiBearerAuth()
@Controller('benefits')
export class BenefitsController {
  constructor(private readonly benefits: BenefitsService) {}

  @Get()
  @RequirePermission('benefits:manage')
  @ZodResponse(HttpStatus.OK, z.array(benefitSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<Benefit[]> {
    return this.benefits.list(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('benefits:manage')
  @ZodResponse(HttpStatus.OK, benefitSchema)
  get(@ZodParam('id', idParam) id: string): Promise<Benefit> {
    return this.benefits.get(id);
  }

  @Post()
  @RequirePermission('benefits:manage')
  @ZodResponse(HttpStatus.CREATED, benefitSchema)
  create(
    @ZodBody(benefitInputSchema) body: z.output<typeof benefitInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Benefit> {
    return this.benefits.save(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('benefits:manage')
  @ZodResponse(HttpStatus.OK, benefitSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(benefitInputSchema) body: z.output<typeof benefitInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Benefit> {
    return this.benefits.save(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('benefits:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.benefits.remove(id, grant);
  }
}

@ApiTags('benefits')
@ApiBearerAuth()
@Controller('employees/:employeeId/benefits')
export class EmployeeBenefitsController {
  constructor(private readonly benefits: BenefitsService) {}

  @Get()
  @RequirePermission('benefits:manage')
  @ZodResponse(HttpStatus.OK, z.array(employeeBenefitSchema))
  list(
    @ZodParam('employeeId', idParam) employeeId: string,
    @Access() grant: AccessGrant,
  ): Promise<EmployeeBenefit[]> {
    return this.benefits.ofEmployee(employeeId, grant);
  }

  @Post()
  @RequirePermission('benefits:manage')
  @ApiOperation({ summary: 'Atribui um benefício ao funcionário' })
  @ZodResponse(HttpStatus.CREATED, employeeBenefitSchema)
  create(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodBody(employeeBenefitInputSchema) body: AssignmentBody,
    @Access() grant: AccessGrant,
  ): Promise<EmployeeBenefit> {
    return this.benefits.saveAssignment(employeeId, null, body, grant);
  }

  @Put(':id')
  @RequirePermission('benefits:manage')
  @ZodResponse(HttpStatus.OK, employeeBenefitSchema)
  update(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodParam('id', idParam) id: string,
    @ZodBody(employeeBenefitInputSchema) body: AssignmentBody,
    @Access() grant: AccessGrant,
  ): Promise<EmployeeBenefit> {
    return this.benefits.saveAssignment(employeeId, id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('benefits:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<void> {
    return this.benefits.removeAssignment(employeeId, id, grant);
  }
}

@ApiTags('benefits')
@ApiBearerAuth()
@Controller('useful-links')
export class UsefulLinksController {
  constructor(private readonly links: UsefulLinksService) {}

  @Get()
  @RequirePermission('useful_links:manage')
  @ZodResponse(HttpStatus.OK, z.array(usefulLinkSchema))
  list(@ZodQuery(includeInactiveQuerySchema) query: IncludeInactive): Promise<UsefulLink[]> {
    return this.links.list(query.includeInactive);
  }

  @Get(':id')
  @RequirePermission('useful_links:manage')
  @ZodResponse(HttpStatus.OK, usefulLinkSchema)
  get(@ZodParam('id', idParam) id: string): Promise<UsefulLink> {
    return this.links.get(id);
  }

  @Post()
  @RequirePermission('useful_links:manage')
  @ZodResponse(HttpStatus.CREATED, usefulLinkSchema)
  create(
    @ZodBody(usefulLinkInputSchema) body: z.output<typeof usefulLinkInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<UsefulLink> {
    return this.links.save(null, body, grant);
  }

  @Put(':id')
  @RequirePermission('useful_links:manage')
  @ZodResponse(HttpStatus.OK, usefulLinkSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(usefulLinkInputSchema) body: z.output<typeof usefulLinkInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<UsefulLink> {
    return this.links.save(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('useful_links:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.links.remove(id, grant);
  }
}

@ApiTags('benefits')
@ApiBearerAuth()
@Controller('me')
export class MyBenefitsController {
  constructor(
    private readonly benefits: BenefitsService,
    private readonly links: UsefulLinksService,
  ) {}

  @Get('benefits')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Benefícios vigentes do próprio funcionário' })
  @ZodResponse(HttpStatus.OK, z.array(myBenefitSchema))
  benefitsMine(@Access() grant: AccessGrant): Promise<MyBenefit[]> {
    return this.benefits.mine(grant.userId);
  }

  @Get('useful-links')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Links úteis ativos da empresa' })
  @ZodResponse(HttpStatus.OK, z.array(usefulLinkSchema))
  usefulLinks(): Promise<UsefulLink[]> {
    return this.links.list(false);
  }
}
