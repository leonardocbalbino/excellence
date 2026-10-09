import { Injectable } from '@nestjs/common';
import type { GeofenceStatus } from '@excellence/shared';
import type { TenantClient } from '../../../infrastructure/prisma/tenant-prisma.service';
import { chainHash, type TimeEntryContent } from '../domain/hash-chain';

export type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

export interface NewTimeEntry {
  companyId: string;
  employeeId: string;
  unitId: string;
  kind: 'clock' | 'inclusion' | 'disregard';
  /** null = agora, pelo relógio do banco (horário oficial do servidor). */
  recordedAt: Date | null;
  deviceRecordedAt?: Date | null;
  referencesEntryId?: string | null;
  adjustmentRequestId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  distanceMeters?: number | null;
  geofenceStatus: GeofenceStatus;
  selfieFileId?: string | null;
  source: 'web' | 'mobile' | 'mobile_offline' | 'adjustment';
  ipAddress?: string | null;
  userAgent?: string | null;
  createdBy: string;
}

/**
 * Único ponto de escrita em `time_entries`. Dentro de uma transação:
 * 1. trava as marcações do funcionário (lock consultivo), para a cadeia não bifurcar;
 * 2. reserva o próximo NSR da empresa;
 * 3. usa o relógio do banco como horário oficial (UTC);
 * 4. encadeia o hash com a marcação anterior do funcionário (regra 3).
 */
@Injectable()
export class TimeEntryWriter {
  async append(tx: Tx, entry: NewTimeEntry) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${entry.employeeId}, 0))`;

    const [counter] = await tx.$queryRaw<{ last_nsr: bigint }[]>`
      INSERT INTO nsr_counters (company_id, last_nsr) VALUES (${entry.companyId}::uuid, 1)
      ON CONFLICT (company_id) DO UPDATE SET last_nsr = nsr_counters.last_nsr + 1
      RETURNING last_nsr`;
    const nsr = counter?.last_nsr ?? 1n;

    let recordedAt = entry.recordedAt;
    if (!recordedAt) {
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      recordedAt = clock?.now ?? new Date();
    }

    const previous = await tx.timeEntry.findFirst({
      where: { employeeId: entry.employeeId },
      orderBy: { nsr: 'desc' },
      select: { hash: true },
    });

    const content: TimeEntryContent = {
      companyId: entry.companyId,
      employeeId: entry.employeeId,
      unitId: entry.unitId,
      nsr: nsr.toString(),
      kind: entry.kind,
      recordedAt: recordedAt.toISOString(),
      deviceRecordedAt: entry.deviceRecordedAt?.toISOString() ?? null,
      referencesEntryId: entry.referencesEntryId ?? null,
      adjustmentRequestId: entry.adjustmentRequestId ?? null,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      accuracyMeters: entry.accuracyMeters ?? null,
      geofenceStatus: entry.geofenceStatus,
      selfieFileId: entry.selfieFileId ?? null,
      source: entry.source,
      createdBy: entry.createdBy,
    };
    const previousHash = previous?.hash ?? null;

    return tx.timeEntry.create({
      data: {
        companyId: entry.companyId,
        employeeId: entry.employeeId,
        unitId: entry.unitId,
        nsr,
        kind: entry.kind,
        recordedAt,
        deviceRecordedAt: entry.deviceRecordedAt ?? null,
        referencesEntryId: entry.referencesEntryId ?? null,
        adjustmentRequestId: entry.adjustmentRequestId ?? null,
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null,
        accuracyMeters: entry.accuracyMeters ?? null,
        distanceMeters: entry.distanceMeters ?? null,
        geofenceStatus: entry.geofenceStatus,
        selfieFileId: entry.selfieFileId ?? null,
        source: entry.source,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent?.slice(0, 512) ?? null,
        createdBy: entry.createdBy,
        previousHash,
        hash: chainHash(previousHash, content),
      },
    });
  }
}

/** Reconstrói o conteúdo hasheado a partir do registro gravado (para verificação). */
export function contentOf(row: {
  companyId: string;
  employeeId: string;
  unitId: string;
  nsr: bigint;
  kind: string;
  recordedAt: Date;
  deviceRecordedAt: Date | null;
  referencesEntryId: string | null;
  adjustmentRequestId: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  geofenceStatus: string;
  selfieFileId: string | null;
  source: string;
  createdBy: string;
}): TimeEntryContent {
  return {
    companyId: row.companyId,
    employeeId: row.employeeId,
    unitId: row.unitId,
    nsr: row.nsr.toString(),
    kind: row.kind,
    recordedAt: row.recordedAt.toISOString(),
    deviceRecordedAt: row.deviceRecordedAt?.toISOString() ?? null,
    referencesEntryId: row.referencesEntryId,
    adjustmentRequestId: row.adjustmentRequestId,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracyMeters,
    geofenceStatus: row.geofenceStatus,
    selfieFileId: row.selfieFileId,
    source: row.source,
    createdBy: row.createdBy,
  };
}
