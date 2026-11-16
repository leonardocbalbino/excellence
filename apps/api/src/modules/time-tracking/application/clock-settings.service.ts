import { Injectable } from '@nestjs/common';
import type { ClockSettings } from '@excellence/shared';
import { RequestContext } from '../../../common/context/request-context';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';

/**
 * Padrões enquanto a empresa não configura (P-008: fora da cerca, aceita e sinaliza). Sem
 * almoço: só entrada e saída. Folga: não abre jornada (P-030). Atraso: 10 min de tolerância e
 * motivo obrigatório (P-031). A foto segue a cerca da unidade (`requireSelfie` é obsoleto).
 */
export const DEFAULT_CLOCK_SETTINGS: ClockSettings = {
  outsideGeofence: 'allow',
  requireLocation: false,
  requireSelfie: true,
  overnightGraceMinutes: 240,
  breakPunches: false,
  blockOffDay: true,
  lateToleranceMinutes: 10,
  lateReasonRequired: true,
};

@Injectable()
export class ClockSettingsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<ClockSettings> {
    const row = await this.db.client.clockSettings.findUnique({
      where: { companyId: RequestContext.require().companyId },
    });
    if (!row) return DEFAULT_CLOCK_SETTINGS;
    return {
      outsideGeofence: row.outsideGeofence,
      requireLocation: row.requireLocation,
      // Obsoleto: os apps até a versão 1.0 (8) leem este campo; true faz eles sempre pedirem a
      // foto, que o servidor aceita com ou sem cerca.
      requireSelfie: true,
      overnightGraceMinutes: row.overnightGraceMin,
      breakPunches: row.breakPunches,
      blockOffDay: row.blockOffDay,
      lateToleranceMinutes: row.lateToleranceMin,
      lateReasonRequired: row.lateReasonRequired,
    };
  }

  async update(input: ClockSettings, grant: AccessGrant): Promise<ClockSettings> {
    assertCompanyWide(grant);
    const before = await this.get();
    const data = {
      outsideGeofence: input.outsideGeofence,
      requireLocation: input.requireLocation,
      overnightGraceMin: input.overnightGraceMinutes,
      breakPunches: input.breakPunches,
      blockOffDay: input.blockOffDay,
      lateToleranceMin: input.lateToleranceMinutes,
      lateReasonRequired: input.lateReasonRequired,
    };
    await this.db.client.$transaction(async (tx) => {
      await tx.clockSettings.upsert({
        where: { companyId: grant.companyId },
        create: { ...data, companyId: grant.companyId },
        update: data,
      });
      await this.audit.record(
        {
          action: 'clock_settings.updated',
          resourceType: 'company',
          resourceId: grant.companyId,
          metadata: toAuditJson({ before, after: input }),
        },
        tx,
      );
    });
    return { ...input, requireSelfie: true };
  }
}
