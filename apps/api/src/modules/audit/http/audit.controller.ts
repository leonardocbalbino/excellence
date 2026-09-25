import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuditLogPage, auditLogPageSchema, auditLogQuerySchema } from '@excellence/shared';
import type { z } from 'zod';
import { ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { AuditQueryService } from '../application/audit-query.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequirePermission('audit:read')
  @ApiOperation({ summary: 'Trilha de auditoria (a própria consulta também é auditada)' })
  @ZodResponse(HttpStatus.OK, auditLogPageSchema)
  list(
    @ZodQuery(auditLogQuerySchema) query: z.output<typeof auditLogQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<AuditLogPage> {
    return this.audit.list(query, grant);
  }
}
