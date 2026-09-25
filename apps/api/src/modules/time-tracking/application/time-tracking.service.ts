import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ClockReceipt,
  type clockInputSchema,
  ProblemType,
  type TimeEntry,
  type Timesheet,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { MedicalCertificatesService } from '../../medical/application/medical-certificates.service';
import { FilesService } from '../../files/application/files.service';
import { CompanyService } from '../../organization/application/company.service';
import { AssignmentsService } from '../../scheduling/application/assignments.service';
import { addDays } from '../../scheduling/domain/planner';
import { EmployeesService } from '../../workforce/application/employees.service';
import { fromCalendarDate, todayIn } from '../../workforce/domain/calendar';
import { evaluateGeofence } from '../domain/geofence';
import { verifyChain } from '../domain/hash-chain';
import { buildTimesheetDays } from '../domain/timesheet';
import { fromZoned, toZoned } from '../domain/zoned-time';
import { ClockSettingsService } from './clock-settings.service';
import { contentOf, TimeEntryWriter } from './time-entry-writer';

type ClockInput = z.output<typeof clockInputSchema>;

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
  source: 'web' | 'mobile';
}

const ENTRY_SELECT = {
  id: true,
  companyId: true,
  employeeId: true,
  unitId: true,
  nsr: true,
  kind: true,
  recordedAt: true,
  deviceRecordedAt: true,
  referencesEntryId: true,
  adjustmentRequestId: true,
  latitude: true,
  longitude: true,
  accuracyMeters: true,
  distanceMeters: true,
  geofenceStatus: true,
  selfieFileId: true,
  source: true,
  createdBy: true,
  previousHash: true,
  hash: true,
  unit: { select: { id: true, name: true, timezone: true } },
} as const;

function fail(type: string, status: number, detail: string): ProblemException {
  return new ProblemException({
    type,
    title: status === 403 ? 'Forbidden' : 'Unprocessable Entity',
    status,
    detail,
  });
}

/**
 * Ponto (ADR 0012): marcação, consulta, comprovante e espelho. Toda escrita passa pelo
 * TimeEntryWriter (append-only com hash encadeado).
 */
@Injectable()
export class TimeTrackingService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly writer: TimeEntryWriter,
    private readonly settings: ClockSettingsService,
    private readonly company: CompanyService,
    private readonly employees: EmployeesService,
    private readonly assignments: AssignmentsService,
    private readonly files: FilesService,
    private readonly certificates: MedicalCertificatesService,
  ) {}

  /** Marcação do próprio funcionário. */
  async clock(grant: AccessGrant, input: ClockInput, client: ClientInfo): Promise<TimeEntry> {
    const employee = await this.ownEmployee(grant.userId);
    const companyTz = await this.company.timezone();
    if (
      employee.terminationDate &&
      fromCalendarDate(employee.terminationDate) < todayIn(companyTz)
    ) {
      throw fail(
        ProblemType.EmployeeTerminated,
        HttpStatus.FORBIDDEN,
        'Funcionário desligado não registra ponto.',
      );
    }

    const settings = await this.settings.get();
    const position =
      input.latitude !== null &&
      input.latitude !== undefined &&
      input.longitude !== null &&
      input.longitude !== undefined
        ? { latitude: input.latitude, longitude: input.longitude }
        : null;
    if (settings.requireLocation && !position) {
      throw fail(
        ProblemType.LocationRequired,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'A localização é obrigatória para registrar o ponto.',
      );
    }
    if (settings.requireSelfie && !input.selfieFileId) {
      throw fail(
        ProblemType.SelfieRequired,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'A foto é obrigatória para registrar o ponto.',
      );
    }
    if (input.selfieFileId) {
      const selfie = await this.files.getOwn(input.selfieFileId);
      if (selfie.purpose !== 'selfie' || selfie.status !== 'uploaded') {
        throw fail(
          ProblemType.SelfieRequired,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'A foto enviada não é válida.',
        );
      }
    }

    const fence = evaluateGeofence(employee.unit, position);
    if (fence.status === 'outside' && settings.outsideGeofence === 'block') {
      throw fail(
        ProblemType.OutsideGeofence,
        HttpStatus.UNPROCESSABLE_ENTITY,
        `Você está a ${Math.round(fence.distanceMeters ?? 0)} m da unidade, fora da área permitida.`,
      );
    }

    const row = await this.db.client.$transaction((tx) =>
      this.writer.append(tx, {
        companyId: grant.companyId,
        employeeId: employee.id,
        unitId: employee.unit.id,
        kind: 'clock',
        recordedAt: null,
        deviceRecordedAt: input.deviceTimestamp ? new Date(input.deviceTimestamp) : null,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
        accuracyMeters: input.accuracyMeters ?? null,
        distanceMeters: fence.distanceMeters,
        geofenceStatus: fence.status,
        selfieFileId: input.selfieFileId ?? null,
        source: client.source,
        ipAddress: client.ip,
        userAgent: client.userAgent,
        createdBy: grant.userId,
      }),
    );
    const [entry] = await this.toEntries([row.id], companyTz);
    if (!entry) throw new NotFoundException('Marcação não encontrada.');
    return entry;
  }

  async mine(userId: string, from: string, to: string): Promise<TimeEntry[]> {
    const employee = await this.ownEmployee(userId);
    return this.listFor(employee.id, employee.unit.timezone, from, to);
  }

  async forEmployee(
    employeeId: string,
    from: string,
    to: string,
    grant: AccessGrant,
  ): Promise<TimeEntry[]> {
    await this.employees.get(employeeId, grant);
    const employee = await this.employeeContext(employeeId);
    return this.listFor(employeeId, employee.unit.timezone, from, to);
  }

  /** Comprovante: o próprio funcionário, ou quem tem `time_entries:read` no escopo. */
  async receipt(
    entryId: string,
    grant: AccessGrant,
    canReadOthers: boolean,
  ): Promise<ClockReceipt> {
    const row = await this.db.client.timeEntry.findUnique({
      where: { id: entryId },
      select: ENTRY_SELECT,
    });
    if (!row) throw new NotFoundException('Marcação não encontrada.');
    const employee = await this.employeeContext(row.employeeId);
    if (employee.userId !== grant.userId) {
      if (!canReadOthers) throw new NotFoundException('Marcação não encontrada.');
      await this.employees.get(row.employeeId, grant);
    }
    const company = await this.company.get();
    const timezone = row.unit.timezone ?? company.timezone;
    const local = toZoned(row.recordedAt, timezone);
    const u = employee.unit;
    const address = [
      u.street,
      u.number,
      u.district,
      u.city && u.state ? `${u.city}/${u.state}` : u.city,
    ]
      .filter(Boolean)
      .join(', ');
    return {
      entryId: row.id,
      nsr: row.nsr.toString(),
      company: { name: company.name, legalName: company.legalName, cnpj: company.cnpj },
      unit: { name: row.unit.name, address: address || null },
      employee: {
        name: employee.socialName ?? employee.name,
        cpf: employee.cpf,
        pis: employee.pis,
      },
      recordedAt: row.recordedAt.toISOString(),
      localDate: local.date,
      localTime: toZonedSeconds(row.recordedAt, timezone),
      timezone,
      hash: row.hash,
    };
  }

  async timesheetMine(userId: string, month: string): Promise<Timesheet> {
    const employee = await this.ownEmployee(userId);
    return this.timesheet(employee.id, month, (from, to) =>
      this.assignments.mine(userId, from, to),
    );
  }

  async timesheetFor(employeeId: string, month: string, grant: AccessGrant): Promise<Timesheet> {
    await this.employees.get(employeeId, grant);
    return this.timesheet(employeeId, month, (from, to) =>
      this.assignments.planned(employeeId, from, to, grant),
    );
  }

  /** Confere a cadeia de hashes do funcionário (integridade das marcações). */
  async verify(employeeId: string, grant: AccessGrant) {
    await this.employees.get(employeeId, grant);
    const rows = await this.db.client.timeEntry.findMany({
      where: { employeeId },
      orderBy: { nsr: 'asc' },
      select: ENTRY_SELECT,
    });
    const result = verifyChain(
      rows.map((row) => ({
        id: row.id,
        previousHash: row.previousHash,
        hash: row.hash,
        content: contentOf(row),
      })),
    );
    return { ...result, entries: rows.length };
  }

  // ─── Interno ──────────────────────────────────────────────────────────────────────

  private async timesheet(
    employeeId: string,
    month: string,
    plan: (from: string, to: string) => Promise<Timesheet['days'][number]['planned'][]>,
  ): Promise<Timesheet> {
    const employee = await this.employeeContext(employeeId);
    const settings = await this.settings.get();
    const timezone = employee.unit.timezone ?? (await this.company.timezone());
    const from = `${month}-01`;
    const to = addDays(addDays(from, 32).slice(0, 8) + '01', -1);
    // Um dia antes, para saber se o turno da véspera atravessa a meia-noite.
    const planned = await plan(addDays(from, -1), to);

    const rows = await this.db.client.timeEntry.findMany({
      where: {
        employeeId,
        recordedAt: {
          gte: fromZoned(from, '00:00', timezone),
          lt: fromZoned(addDays(to, 2), '00:00', timezone),
        },
      },
      orderBy: { recordedAt: 'asc' },
      select: {
        id: true,
        kind: true,
        recordedAt: true,
        geofenceStatus: true,
        referencesEntryId: true,
      },
    });
    const disregarded = new Set(
      rows.filter((r) => r.kind === 'disregard').map((r) => r.referencesEntryId),
    );
    const effective = rows.filter((r) => r.kind !== 'disregard' && !disregarded.has(r.id));

    const pending = await this.db.client.timeAdjustmentRequest.findMany({
      where: { employeeId, status: 'pending' },
      select: { proposedAt: true, targetEntryId: true },
    });
    const pendingByDate = new Map<string, number>();
    for (const request of pending) {
      const instant =
        request.proposedAt ?? rows.find((r) => r.id === request.targetEntryId)?.recordedAt ?? null;
      if (!instant) continue;
      const date = toZoned(instant, timezone).date;
      pendingByDate.set(date, (pendingByDate.get(date) ?? 0) + 1);
    }

    const justifications = await this.certificates.acceptedBetween(employeeId, from, to);

    const days = buildTimesheetDays({
      planned,
      entries: effective,
      timezone,
      graceMinutes: settings.overnightGraceMinutes,
      pendingByDate,
      justifications,
    }).filter((day) => day.date >= from);

    return {
      month,
      employee: {
        id: employee.id,
        name: employee.socialName ?? employee.name,
        registrationNumber: employee.registrationNumber,
      },
      timezone,
      days,
      totals: {
        workedMinutes: days.reduce((sum, d) => sum + d.workedMinutes, 0),
        plannedMinutes: days.reduce((sum, d) => sum + (d.planned.shift?.workMinutes ?? 0), 0),
      },
    };
  }

  private async listFor(
    employeeId: string,
    unitTz: string | null,
    from: string,
    to: string,
  ): Promise<TimeEntry[]> {
    const companyTz = await this.company.timezone();
    const timezone = unitTz ?? companyTz;
    const rows = await this.db.client.timeEntry.findMany({
      where: {
        employeeId,
        recordedAt: {
          gte: fromZoned(from, '00:00', timezone),
          lt: fromZoned(addDays(to, 1), '00:00', timezone),
        },
      },
      orderBy: { nsr: 'asc' },
      select: { id: true },
    });
    return this.toEntries(
      rows.map((r) => r.id),
      companyTz,
    );
  }

  private async toEntries(ids: string[], companyTz: string): Promise<TimeEntry[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.client.timeEntry.findMany({
      where: { id: { in: ids } },
      orderBy: { nsr: 'asc' },
      select: ENTRY_SELECT,
    });
    const disregards = await this.db.client.timeEntry.findMany({
      where: { referencesEntryId: { in: ids }, kind: 'disregard' },
      select: { referencesEntryId: true },
    });
    const disregarded = new Set(disregards.map((d) => d.referencesEntryId));
    return rows.map((row) => {
      const timezone = row.unit.timezone ?? companyTz;
      const local = toZoned(row.recordedAt, timezone);
      return {
        id: row.id,
        nsr: row.nsr.toString(),
        kind: row.kind,
        recordedAt: row.recordedAt.toISOString(),
        deviceRecordedAt: row.deviceRecordedAt?.toISOString() ?? null,
        localDate: local.date,
        localTime: local.time,
        timezone,
        unit: { id: row.unit.id, name: row.unit.name },
        geofenceStatus: row.geofenceStatus,
        distanceMeters: row.distanceMeters,
        accuracyMeters: row.accuracyMeters,
        hasSelfie: row.selfieFileId !== null,
        referencesEntryId: row.referencesEntryId,
        disregarded: disregarded.has(row.id),
        hash: row.hash,
      };
    });
  }

  private async ownEmployee(userId: string) {
    const own = await this.db.client.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!own) {
      throw fail(
        ProblemType.NoEmployeeRecord,
        HttpStatus.FORBIDDEN,
        'Seu usuário não está ligado a um cadastro de funcionário.',
      );
    }
    return this.employeeContext(own.id);
  }

  async employeeContext(employeeId: string) {
    return this.db.client.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        id: true,
        userId: true,
        name: true,
        socialName: true,
        registrationNumber: true,
        cpf: true,
        pis: true,
        terminationDate: true,
        unit: {
          select: {
            id: true,
            name: true,
            timezone: true,
            latitude: true,
            longitude: true,
            geofenceRadiusMeters: true,
            street: true,
            number: true,
            district: true,
            city: true,
            state: true,
          },
        },
      },
    });
  }
}

/** HH:MM:SS no fuso (o comprovante mostra os segundos). */
function toZonedSeconds(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(instant);
}
