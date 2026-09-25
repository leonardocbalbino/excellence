import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditQueryService } from './application/audit-query.service';
import { AuditService } from './application/audit.service';
import { AuditController } from './http/audit.controller';
import { SensitiveReadAuditInterceptor } from './http/sensitive-read-audit.interceptor';

/** Auditoria: audit_logs append-only e registro de leituras sensíveis (ADR 0008). */
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditQueryService,
    { provide: APP_INTERCEPTOR, useClass: SensitiveReadAuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
