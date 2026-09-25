import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type DownloadLink,
  type MedicalCertificate,
  type MedicalCertificateSensitive,
  type medicalCertificateInputSchema,
  type medicalCertificateListQuerySchema,
  ProblemType,
  timeToMinutes,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { Prisma } from '../../../generated/prisma/client';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { FilesService } from '../../files/application/files.service';
import { invalidReference } from '../../organization/application/catalog-rules';
import { EmployeesService } from '../../workforce/application/employees.service';
import { fromCalendarDate, toCalendarDate } from '../../workforce/domain/calendar';
import { employeeScopeWhere } from '../../workforce/domain/employee-scope';
import { minutesToTime, periodDays, periodsOverlap } from '../domain/certificate-period';

type CertificateInput = z.output<typeof medicalCertificateInputSchema>;
type ListQuery = z.output<typeof medicalCertificateListQuerySchema>;

/**
 * Campos da visão pública. O CID é lido só para calcular `hasCid`; `toCertificate` nunca o
 * devolve (regra 7).
 */
const CERTIFICATE_SELECT = {
  id: true,
  employeeId: true,
  fileId: true,
  startDate: true,
  endDate: true,
  startMinute: true,
  endMinute: true,
  issuerName: true,
  issuerRegistry: true,
  cid: true,
  notes: true,
  status: true,
  submittedBy: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
  employee: {
    select: { id: true, name: true, socialName: true, registrationNumber: true, userId: true },
  },
  file: { select: { originalName: true, contentType: true } },
} as const;

type CertificateRow = Prisma.MedicalCertificateGetPayload<{
  select: typeof CERTIFICATE_SELECT;
}>;

/** Situações que ocupam o período (um novo atestado não pode se sobrepor a elas). */
const ACTIVE_STATUSES = ['pending', 'accepted'] as const;

function notPending(): ProblemException {
  return new ProblemException({
    type: ProblemType.MedicalCertificateNotPending,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail: 'Este atestado já foi analisado ou cancelado.',
  });
}

/** Justificativa aceita num dia, para o espelho de ponto. */
export interface AcceptedJustification {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
}

/**
 * Atestados: o funcionário envia (ou o RH registra em nome dele) e o RH aceita ou recusa.
 * O CID e o documento digitalizado são dados sensíveis e só saem por `sensitive()`, cuja
 * leitura é auditada pelo interceptor de leitura sensível.
 */
@Injectable()
export class MedicalCertificatesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly files: FilesService,
    private readonly employees: EmployeesService,
    private readonly audit: AuditService,
  ) {}

  async submitMine(input: CertificateInput, grant: AccessGrant): Promise<MedicalCertificate> {
    const own = await this.ownEmployee(grant.userId);
    return this.create(own.id, input, grant);
  }

  /** Registro em nome de um funcionário do escopo (`medical_certificates:manage`). */
  async registerFor(
    employeeId: string,
    input: CertificateInput,
    grant: AccessGrant,
  ): Promise<MedicalCertificate> {
    await this.employees.get(employeeId, grant);
    return this.create(employeeId, input, grant);
  }

  async listMine(userId: string): Promise<MedicalCertificate[]> {
    const rows = await this.db.client.medicalCertificate.findMany({
      where: { employee: { userId } },
      select: CERTIFICATE_SELECT,
      orderBy: { startDate: 'desc' },
      take: 200,
    });
    return rows.map(toCertificate);
  }

  /** Documento do próprio atestado (o funcionário sempre pode ver o que enviou). */
  async myDocument(id: string, userId: string): Promise<DownloadLink> {
    const row = await this.db.client.medicalCertificate.findFirst({
      where: { id, employee: { userId } },
      select: { fileId: true },
    });
    if (!row) throw new NotFoundException('Atestado não encontrado.');
    return this.files.createDownloadLink(row.fileId);
  }

  async cancelMine(id: string, userId: string): Promise<MedicalCertificate> {
    const updated = await this.db.client.$transaction(async (tx) => {
      const result = await tx.medicalCertificate.updateMany({
        where: { id, status: 'pending', employee: { userId } },
        data: { status: 'cancelled' },
      });
      if (result.count === 0) return false;
      await this.audit.record(
        {
          action: 'medical_certificate.cancelled',
          resourceType: 'medical_certificate',
          resourceId: id,
        },
        tx,
      );
      return true;
    });
    if (!updated) throw notPending();
    return this.get(id);
  }

  async list(query: ListQuery, grant: AccessGrant): Promise<MedicalCertificate[]> {
    if (!grant.scope) return [];
    const scope = employeeScopeWhere(grant.scope, await this.employees.actor(grant));
    if (!scope) return [];
    const filters: Prisma.MedicalCertificateWhereInput[] = [{ employee: scope }];
    if (query.status) filters.push({ status: query.status });
    if (query.employeeId) filters.push({ employeeId: query.employeeId });
    if (query.from) filters.push({ endDate: { gte: toCalendarDate(query.from) } });
    if (query.to) filters.push({ startDate: { lte: toCalendarDate(query.to) } });
    const rows = await this.db.client.medicalCertificate.findMany({
      where: { AND: filters },
      select: CERTIFICATE_SELECT,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return rows.map(toCertificate);
  }

  /**
   * CID e link do documento. A permissão é sensível: o interceptor grava a leitura na
   * auditoria antes de a resposta sair.
   */
  async sensitive(id: string, grant: AccessGrant): Promise<MedicalCertificateSensitive> {
    const row = await this.db.client.medicalCertificate.findUnique({
      where: { id },
      select: { id: true, employeeId: true, fileId: true, cid: true },
    });
    if (!row) throw new NotFoundException('Atestado não encontrado.');
    await this.employees.get(row.employeeId, grant);
    return { id: row.id, cid: row.cid, document: await this.files.createDownloadLink(row.fileId) };
  }

  async accept(id: string, note: string | null, grant: AccessGrant): Promise<MedicalCertificate> {
    return this.review(id, 'accepted', note, grant);
  }

  async reject(id: string, note: string | null, grant: AccessGrant): Promise<MedicalCertificate> {
    if (!note) throw invalidReference('note', 'Informe o motivo da recusa.');
    return this.review(id, 'rejected', note, grant);
  }

  /** Atestados aceitos que tocam o intervalo, para o espelho de ponto. */
  async acceptedBetween(
    employeeId: string,
    from: string,
    to: string,
  ): Promise<AcceptedJustification[]> {
    const rows = await this.db.client.medicalCertificate.findMany({
      where: {
        employeeId,
        status: 'accepted',
        startDate: { lte: toCalendarDate(to) },
        endDate: { gte: toCalendarDate(from) },
      },
      select: { id: true, startDate: true, endDate: true, startMinute: true, endMinute: true },
    });
    return rows.map((row) => ({
      id: row.id,
      startDate: fromCalendarDate(row.startDate),
      endDate: fromCalendarDate(row.endDate),
      startTime: row.startMinute === null ? null : minutesToTime(row.startMinute),
      endTime: row.endMinute === null ? null : minutesToTime(row.endMinute),
    }));
  }

  // ─── Interno ──────────────────────────────────────────────────────────────────────

  private async create(
    employeeId: string,
    input: CertificateInput,
    grant: AccessGrant,
  ): Promise<MedicalCertificate> {
    // Só um arquivo enviado por quem registra, confirmado e com a finalidade certa.
    const file = await this.files.getOwn(input.fileId).catch(() => null);
    if (file?.purpose !== 'medical_certificate' || file.status !== 'uploaded') {
      throw invalidReference('fileId', 'Envie o documento do atestado antes de registrar.');
    }
    const linked = await this.db.client.medicalCertificate.count({
      where: { fileId: input.fileId },
    });
    if (linked > 0) {
      throw invalidReference('fileId', 'Este documento já está ligado a outro atestado.');
    }

    const period = {
      startDate: input.startDate,
      endDate: input.endDate,
      startMinute: input.startTime ? timeToMinutes(input.startTime) : null,
      endMinute: input.endTime ? timeToMinutes(input.endTime) : null,
    };
    const existing = await this.db.client.medicalCertificate.findMany({
      where: {
        employeeId,
        status: { in: [...ACTIVE_STATUSES] },
        startDate: { lte: toCalendarDate(input.endDate) },
        endDate: { gte: toCalendarDate(input.startDate) },
      },
      select: { startDate: true, endDate: true, startMinute: true, endMinute: true },
    });
    const overlapping = existing.some((row) =>
      periodsOverlap(period, {
        startDate: fromCalendarDate(row.startDate),
        endDate: fromCalendarDate(row.endDate),
        startMinute: row.startMinute,
        endMinute: row.endMinute,
      }),
    );
    if (overlapping) {
      throw new ProblemException({
        type: ProblemType.MedicalCertificateOverlap,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'Já existe atestado pendente ou aceito que cobre este período.',
        errors: [{ path: 'startDate', message: 'Período já coberto por outro atestado' }],
      });
    }

    const row = await this.db.client.$transaction(async (tx) => {
      const created = await tx.medicalCertificate.create({
        data: {
          companyId: grant.companyId,
          employeeId,
          fileId: input.fileId,
          startDate: toCalendarDate(input.startDate),
          endDate: toCalendarDate(input.endDate),
          startMinute: period.startMinute,
          endMinute: period.endMinute,
          issuerName: input.issuerName,
          issuerRegistry: input.issuerRegistry,
          cid: input.cid ?? null,
          notes: input.notes,
          submittedBy: grant.userId,
        },
        select: CERTIFICATE_SELECT,
      });
      await this.audit.record(
        {
          action: 'medical_certificate.submitted',
          resourceType: 'medical_certificate',
          resourceId: created.id,
          // Nunca o CID: a trilha de auditoria não guarda dado sensível.
          metadata: { employeeId, startDate: input.startDate, endDate: input.endDate },
        },
        tx,
      );
      return created;
    });
    return toCertificate(row);
  }

  private async review(
    id: string,
    status: 'accepted' | 'rejected',
    note: string | null,
    grant: AccessGrant,
  ): Promise<MedicalCertificate> {
    const current = await this.db.client.medicalCertificate.findUnique({
      where: { id },
      select: { employeeId: true, status: true, employee: { select: { userId: true } } },
    });
    if (!current) throw new NotFoundException('Atestado não encontrado.');
    await this.employees.get(current.employeeId, grant);
    if (current.status !== 'pending') throw notPending();
    if (current.employee.userId === grant.userId) {
      throw new ProblemException({
        type: ProblemType.SelfApproval,
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        detail: 'Você não pode analisar o seu próprio atestado.',
      });
    }

    await this.db.client.$transaction(async (tx) => {
      // Só uma análise vence, mesmo com duas pessoas decidindo ao mesmo tempo.
      const claimed = await tx.medicalCertificate.updateMany({
        where: { id, status: 'pending' },
        data: { status, reviewedBy: grant.userId, reviewedAt: new Date(), reviewNote: note },
      });
      if (claimed.count === 0) throw notPending();
      await this.audit.record(
        {
          action: `medical_certificate.${status}`,
          resourceType: 'medical_certificate',
          resourceId: id,
          metadata: { employeeId: current.employeeId, note },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private async get(id: string): Promise<MedicalCertificate> {
    const row = await this.db.client.medicalCertificate.findUniqueOrThrow({
      where: { id },
      select: CERTIFICATE_SELECT,
    });
    return toCertificate(row);
  }

  private async ownEmployee(userId: string) {
    const own = await this.db.client.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!own) {
      throw new NotFoundException('Seu usuário não está ligado a um cadastro de funcionário.');
    }
    return own;
  }
}

function toCertificate(row: CertificateRow): MedicalCertificate {
  const startDate = fromCalendarDate(row.startDate);
  const endDate = fromCalendarDate(row.endDate);
  return {
    id: row.id,
    employee: {
      id: row.employee.id,
      name: row.employee.socialName ?? row.employee.name,
      registrationNumber: row.employee.registrationNumber,
    },
    startDate,
    endDate,
    startTime: row.startMinute === null ? null : minutesToTime(row.startMinute),
    endTime: row.endMinute === null ? null : minutesToTime(row.endMinute),
    days: periodDays(startDate, endDate),
    issuerName: row.issuerName,
    issuerRegistry: row.issuerRegistry,
    hasCid: row.cid !== null,
    notes: row.notes,
    file: { name: row.file.originalName, contentType: row.file.contentType },
    status: row.status,
    submittedBy: row.submittedBy,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
  };
}
