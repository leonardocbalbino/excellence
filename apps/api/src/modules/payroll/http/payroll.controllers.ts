import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  benefitDaysAdjustmentInputSchema,
  benefitDaysQuerySchema,
  type BenefitDaysSummary,
  benefitDaysSummarySchema,
  type MyPayrollPreview,
  myPayrollPreviewSchema,
  payrollGenerateSchema,
  type PayrollPeriod,
  type PayrollPeriodDetail,
  payrollPeriodDetailSchema,
  payrollPeriodSchema,
  type ScheduleRate,
  scheduleRateInputSchema,
  scheduleRateSchema,
  type UnitMonthlySummary,
  unitMonthlySummaryQuerySchema,
  unitMonthlySummarySchema,
} from '@excellence/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { BenefitDaysService } from '../application/benefit-days.service';
import { PayrollService } from '../application/payroll.service';
import { ScheduleRatesService } from '../application/schedule-rates.service';

const idParam = z.uuid();

/** VA e VT calculados por dia pelo ponto, com as exceções antes do fechamento (ADR 0021). */
@ApiTags('payroll')
@ApiBearerAuth()
@Controller('benefit-days')
export class BenefitDaysController {
  constructor(private readonly benefitDays: BenefitDaysService) {}

  @Get()
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'VA e VT do mês por funcionário, com o resumo da empresa e dos postos' })
  @ZodResponse(HttpStatus.OK, benefitDaysSummarySchema)
  summary(
    @ZodQuery(benefitDaysQuerySchema) query: z.output<typeof benefitDaysQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<BenefitDaysSummary> {
    return this.benefitDays.summary(query.month, grant);
  }

  @Put('adjustments')
  @RequirePermission('payroll:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Lança (ou troca) a exceção no VA ou VT de um funcionário no mês' })
  adjust(
    @ZodBody(benefitDaysAdjustmentInputSchema)
    body: z.output<typeof benefitDaysAdjustmentInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<void> {
    return this.benefitDays.adjust(body, grant);
  }

  @Delete('adjustments/:id')
  @RequirePermission('payroll:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desfaz a exceção (volta ao valor calculado)' })
  removeAdjustment(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<void> {
    return this.benefitDays.removeAdjustment(id, grant);
  }
}

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

/** Pasta do posto (condomínio): valores por plantão e resumo do mês (ADR 0020). */
@ApiTags('payroll')
@ApiBearerAuth()
@Controller('units/:unitId')
export class UnitPayController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly rates: ScheduleRatesService,
  ) {}

  @Get('schedule-rates')
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Valores por plantão das escalas do posto, com vigência' })
  @ZodResponse(HttpStatus.OK, z.array(scheduleRateSchema))
  listRates(
    @ZodParam('unitId', idParam) unitId: string,
    @Access() grant: AccessGrant,
  ): Promise<ScheduleRate[]> {
    return this.rates.list(unitId, grant);
  }

  @Put('schedule-rates')
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Cadastra (ou corrige) o valor por plantão a partir de um mês' })
  @ZodResponse(HttpStatus.OK, scheduleRateSchema)
  saveRate(
    @ZodParam('unitId', idParam) unitId: string,
    @ZodBody(scheduleRateInputSchema) body: z.output<typeof scheduleRateInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<ScheduleRate> {
    return this.rates.save(unitId, body, grant);
  }

  @Delete('schedule-rates/:rateId')
  @RequirePermission('payroll:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeRate(
    @ZodParam('unitId', idParam) unitId: string,
    @ZodParam('rateId', idParam) rateId: string,
    @Access() grant: AccessGrant,
  ): Promise<void> {
    return this.rates.remove(unitId, rateId, grant);
  }

  @Get('monthly-summary')
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Resumo do mês do posto: plantões, valores, faltas e atestados' })
  @ZodResponse(HttpStatus.OK, unitMonthlySummarySchema)
  summary(
    @ZodParam('unitId', idParam) unitId: string,
    @ZodQuery(unitMonthlySummaryQuerySchema) query: z.output<typeof unitMonthlySummaryQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<UnitMonthlySummary> {
    return this.payroll.unitSummary(unitId, query.month, grant);
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
