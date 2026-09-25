import { Injectable } from '@nestjs/common';
import type { ClockSettings } from '@excellence/shared';
import { RequestContext } from '../../../common/context/request-context';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { assertCompanyWide } from '../../access-control/application/access-rules';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService, toAuditJson } from '../../audit/application/audit.service';

/** Padrões enquanto a empresa não configura (P-008: fora da cerca, aceita e sinaliza). */
export const DEFAULT_CLOCK_SETTINGS: ClockSettings = {
  outsideGeofence: 'allow',
  requireLocation: false,
  requireSelfie: false,
  overnightGraceMinutes: 240,
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
      requireSelfie: row.requireSelfie,
      overnightGraceMinutes: row.overnightGraceMin,
    };
  }

  async update(input: ClockSettings, grant: AccessGrant): Promise<ClockSettings> {
    assertCompanyWide(grant);
    const before = await this.get();
    const data = {
      outsideGeofence: input.outsideGeofence,
      requireLocation: input.requireLocation,
      requireSelfie: input.requireSelfie,
      overnightGraceMin: input.overnightGraceMinutes,
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
    return input;
  }
}
