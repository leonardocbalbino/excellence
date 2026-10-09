import { Controller, Get, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  type MyPayrollPreview,
  myPayrollPreviewSchema,
  payrollGenerateSchema,
  type PayrollPeriod,
  type PayrollPeriodDetail,
  payrollPeriodDetailSchema,
  payrollPeriodSchema,
} from '@excellence/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { PayrollService } from '../application/payroll.service';

const idParam = z.uuid();

@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll-periods')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get()
  @RequirePermission('payroll:manage')
  @ZodResponse(HttpStatus.OK, z.array(payrollPeriodSchema))
  list(): Promise<PayrollPeriod[]> {
    return this.payroll.list();
  }

  @Post()
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Gera (ou gera de novo) o fechamento do mês' })
  @ZodResponse(HttpStatus.CREATED, payrollPeriodDetailSchema)
  generate(
    @ZodBody(payrollGenerateSchema) body: z.output<typeof payrollGenerateSchema>,
    @Access() grant: AccessGrant,
  ): Promise<PayrollPeriodDetail> {
    return this.payroll.generate(body.month, grant);
  }

  @Get(':id')
  @RequirePermission('payroll:manage')
  @ZodResponse(HttpStatus.OK, payrollPeriodDetailSchema)
  get(@ZodParam('id', idParam) id: string): Promise<PayrollPeriodDetail> {
    return this.payroll.get(id);
  }

  @Post(':id/publish')
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Publica a prévia para os funcionários' })
  @ZodResponse(HttpStatus.CREATED, payrollPeriodSchema)
  publish(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant) {
    return this.payroll.publish(id, grant);
  }

  @Post(':id/close')
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Fecha o mês (definitivo)' })
  @ZodResponse(HttpStatus.CREATED, payrollPeriodSchema)
  close(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant) {
    return this.payroll.close(id, grant);
  }

  @Get(':id/export')
  @RequirePermission('payroll:manage')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Arquivo do fechamento para o escritório de contabilidade' })
  async export(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const file = await this.payroll.exportCsv(id, grant);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return file.content;
  }
}

@ApiTags('payroll')
@ApiBearerAuth()
@Controller('me')
export class MyPayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('payroll-previews')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Prévias da folha do próprio funcionário (meses publicados)' })
  @ZodResponse(HttpStatus.OK, z.array(myPayrollPreviewSchema))
  mine(@Access() grant: AccessGrant): Promise<MyPayrollPreview[]> {
    return this.payroll.mine(grant.userId);
  }
}
