import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Announcement,
  type AnnouncementReceipt,
  type AnnouncementStatus,
  type announcementInputSchema,
  type MyAnnouncement,
  type MyAnnouncementFeed,
  ProblemType,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { Prisma } from '../../../generated/prisma/client';
import {
  type TenantClient,
  TenantPrismaService,
} from '../../../infrastructure/prisma/tenant-prisma.service';
import type { DataScope } from '../../access-control/domain/data-scope';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { invalidReference } from '../../organization/application/catalog-rules';
import { EmployeesService } from '../../workforce/application/employees.service';
import { toCalendarDate } from '../../workforce/domain/calendar';
import { employeeScopeWhere } from '../../workforce/domain/employee-scope';
import { type Audience, canAddress, isCompanyWide } from '../domain/audience';

type AnnouncementInput = z.output<typeof announcementInputSchema>;
type Tx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

export interface ReaderInfo {
  ip: string | null;
  userAgent: string | null;
}

const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  body: true,
  requiresAcknowledgment: true,
  status: true,
  publishedAt: true,
  expiresAt: true,
  archivedAt: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  units: { select: { unit: { select: { id: true, name: true } } } },
  departments: { select: { department: { select: { id: true, name: true } } } },
} as const;

type AnnouncementRow = Prisma.AnnouncementGetPayload<{ select: typeof ANNOUNCEMENT_SELECT }>;

const FEED_SELECT = {
  id: true,
  title: true,
  body: true,
  requiresAcknowledgment: true,
  publishedAt: true,
  expiresAt: true,
} as const;

function audienceOf(row: AnnouncementRow): Audience {
  return {
    unitIds: row.units.map((u) => u.unit.id),
    departmentIds: row.departments.map((d) => d.department.id),
  };
}

function notEditable(detail: string): ProblemException {
  return new ProblemException({
    type: ProblemType.AnnouncementNotEditable,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail,
  });
}

function requireScope(grant: AccessGrant): DataScope {
  if (!grant.scope) throw new Error('Rota de comunicados sem escopo de permissão');
  return grant.scope;
}

/**
 * Comunicados (ADR 0014): rascunho → publicado → arquivado. Publicado, conteúdo e público
 * congelam (trigger no banco); leituras e ciências são append-only.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly employees: EmployeesService,
    private readonly audit: AuditService,
  ) {}

  // ─── Mural do usuário ─────────────────────────────────────────────────────────────

  async feed(userId: string): Promise<MyAnnouncementFeed> {
    const rows = await this.db.client.announcement.findMany({
      where: await this.visibleTo(userId),
      select: FEED_SELECT,
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
    const reads = await this.readsOf(
      userId,
      rows.map((r) => r.id),
    );
    const items = rows.map((row) => toMine(row, reads.get(row.id)));
    const pending = items.filter(
      (item) => !item.viewedAt || (item.requiresAcknowledgment && !item.acknowledgedAt),
    ).length;
    return { items, pending };
  }

  /** Abre o comunicado e registra a leitura (uma vez por usuário). */
  async open(id: string, grant: AccessGrant, reader: ReaderInfo): Promise<MyAnnouncement> {
    const row = await this.visible(id, grant.userId);
    await this.record(row.id, grant, ['viewed'], reader);
    return toMine(row, (await this.readsOf(grant.userId, [row.id])).get(row.id));
  }

  /** "Li e estou ciente": vale para o conteúdo publicado, que não muda mais. */
  async acknowledge(id: string, grant: AccessGrant, reader: ReaderInfo): Promise<MyAnnouncement> {
    const row = await this.visible(id, grant.userId);
    if (!row.requiresAcknowledgment) {
      throw invalidReference('id', 'Este comunicado não pede confirmação de ciência.');
    }
    await this.record(row.id, grant, ['viewed', 'acknowledged'], reader);
    return toMine(row, (await this.readsOf(grant.userId, [row.id])).get(row.id));
  }

  // ─── Gestão ───────────────────────────────────────────────────────────────────────

  async list(status: AnnouncementStatus | undefined, grant: AccessGrant): Promise<Announcement[]> {
    const scope = requireScope(grant);
    const rows = await this.db.client.announcement.findMany({
      where: status ? { status } : {},
      select: ANNOUNCEMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return this.toAnnouncements(rows.filter((row) => this.manageable(row, scope, grant)));
  }

  async get(id: string, grant: AccessGrant): Promise<Announcement> {
    const [announcement] = await this.toAnnouncements([await this.managed(id, grant)]);
    if (!announcement) throw new NotFoundException('Comunicado não encontrado.');
    return announcement;
  }

  async create(input: AnnouncementInput, grant: AccessGrant): Promise<Announcement> {
    await this.checkAudience(input.audience, grant);
    const created = await this.db.client.$transaction(async (tx) => {
      const row = await tx.announcement.create({
        data: {
          companyId: grant.companyId,
          title: input.title,
          body: input.body,
          requiresAcknowledgment: input.requiresAcknowledgment,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: grant.userId,
        },
        select: { id: true },
      });
      await this.writeAudience(tx, row.id, input.audience, grant.companyId);
      await this.audit.record(
        {
          action: 'announcement.created',
          resourceType: 'announcement',
          resourceId: row.id,
          metadata: { title: input.title },
        },
        tx,
      );
      return row;
    });
    return this.get(created.id, grant);
  }

  /** Só rascunhos: publicado, o conteúdo é a prova do que foi comunicado. */
  async update(id: string, input: AnnouncementInput, grant: AccessGrant): Promise<Announcement> {
    const current = await this.managed(id, grant);
    if (current.status !== 'draft') {
      throw notEditable('Comunicado publicado não pode ser alterado. Publique um novo.');
    }
    await this.checkAudience(input.audience, grant);
    await this.db.client.$transaction(async (tx) => {
      const updated = await tx.announcement.updateMany({
        where: { id, status: 'draft' },
        data: {
          title: input.title,
          body: input.body,
          requiresAcknowledgment: input.requiresAcknowledgment,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });
      if (updated.count === 0)
        throw notEditable('O comunicado foi publicado enquanto você editava.');
      await tx.announcementUnit.deleteMany({ where: { announcementId: id } });
      await tx.announcementDepartment.deleteMany({ where: { announcementId: id } });
      await this.writeAudience(tx, id, input.audience, grant.companyId);
      await this.audit.record(
        { action: 'announcement.updated', resourceType: 'announcement', resourceId: id },
        tx,
      );
    });
    return this.get(id, grant);
  }

  async remove(id: string, grant: AccessGrant): Promise<void> {
    const current = await this.managed(id, grant);
    if (current.status !== 'draft') {
      throw notEditable('Comunicado publicado não pode ser excluído. Arquive-o.');
    }
    await this.db.client.$transaction(async (tx) => {
      const deleted = await tx.announcement.deleteMany({ where: { id, status: 'draft' } });
      if (deleted.count === 0) throw notEditable('O comunicado já foi publicado.');
      await this.audit.record(
        {
          action: 'announcement.deleted',
          resourceType: 'announcement',
          resourceId: id,
          metadata: { title: current.title },
        },
        tx,
      );
    });
  }

  async publish(id: string, grant: AccessGrant): Promise<Announcement> {
    const current = await this.managed(id, grant);
    if (current.status !== 'draft') throw notEditable('O comunicado já foi publicado.');
    if (current.expiresAt && current.expiresAt.getTime() <= Date.now()) {
      throw invalidReference('expiresAt', 'A validade já passou. Ajuste antes de publicar.');
    }
    await this.db.client.$transaction(async (tx) => {
      const published = await tx.announcement.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'published', publishedAt: new Date(), publishedBy: grant.userId },
      });
      if (published.count === 0) throw notEditable('O comunicado já foi publicado.');
      await this.audit.record(
        {
          action: 'announcement.published',
          resourceType: 'announcement',
          resourceId: id,
          metadata: { title: current.title, audience: toAuditAudience(audienceOf(current)) },
        },
        tx,
      );
    });
    return this.get(id, grant);
  }

  /** Tira do mural; leituras e ciências continuam registradas. */
  async archive(id: string, grant: AccessGrant): Promise<Announcement> {
    const current = await this.managed(id, grant);
    if (current.status !== 'published')
      throw notEditable('Só comunicados publicados são arquivados.');
    await this.db.client.$transaction(async (tx) => {
      const archived = await tx.announcement.updateMany({
        where: { id, status: 'published' },
        data: { status: 'archived', archivedAt: new Date() },
      });
      if (archived.count === 0) throw notEditable('O comunicado já foi arquivado.');
      await this.audit.record(
        { action: 'announcement.archived', resourceType: 'announcement', resourceId: id },
        tx,
      );
    });
    return this.get(id, grant);
  }

  /**
   * Quem do público (e do escopo de quem consulta) leu e deu ciência. Considera os
   * funcionários ativos na data da publicação.
   */
  async receipts(id: string, grant: AccessGrant): Promise<AnnouncementReceipt[]> {
    const row = await this.managed(id, grant);
    if (!row.publishedAt) return [];
    const scope = employeeScopeWhere(requireScope(grant), await this.employees.actor(grant));
    if (!scope) return [];
    const audience = audienceOf(row);
    const filters: Prisma.EmployeeWhereInput[] = [
      scope,
      { hireDate: { lte: row.publishedAt } },
      {
        OR: [
          { terminationDate: null },
          { terminationDate: { gte: toCalendarDate(row.publishedAt.toISOString().slice(0, 10)) } },
        ],
      },
    ];
    if (!isCompanyWide(audience)) {
      filters.push({
        OR: [
          { unitId: { in: [...audience.unitIds] } },
          { departmentId: { in: [...audience.departmentIds] } },
        ],
      });
    }
    const employees = await this.db.client.employee.findMany({
      where: { AND: filters },
      select: {
        id: true,
        name: true,
        socialName: true,
        registrationNumber: true,
        userId: true,
        unit: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
      take: 5000,
    });
    const userIds = employees.map((e) => e.userId).filter((u): u is string => u !== null);
    const reads = userIds.length
      ? await this.db.client.announcementRead.findMany({
          where: { announcementId: id, userId: { in: userIds } },
          select: { userId: true, kind: true, createdAt: true },
        })
      : [];
    const readAt = (userId: string | null, kind: 'viewed' | 'acknowledged') =>
      reads.find((r) => r.userId === userId && r.kind === kind)?.createdAt.toISOString() ?? null;

    return employees.map((employee) => ({
      employee: {
        id: employee.id,
        name: employee.socialName ?? employee.name,
        registrationNumber: employee.registrationNumber,
      },
      unit: employee.unit.name,
      department: employee.department?.name ?? null,
      hasAccount: employee.userId !== null,
      viewedAt: employee.userId ? readAt(employee.userId, 'viewed') : null,
      acknowledgedAt: employee.userId ? readAt(employee.userId, 'acknowledged') : null,
    }));
  }

  // ─── Interno ──────────────────────────────────────────────────────────────────────

  /** Publicados, vigentes e cujo público inclui o usuário. */
  private async visibleTo(userId: string): Promise<Prisma.AnnouncementWhereInput> {
    const placement = await this.db.client.employee.findUnique({
      where: { userId },
      select: { unitId: true, departmentId: true },
    });
    const now = new Date();
    const audience: Prisma.AnnouncementWhereInput[] = [
      { units: { none: {} }, departments: { none: {} } },
    ];
    if (placement) {
      audience.push({ units: { some: { unitId: placement.unitId } } });
      if (placement.departmentId) {
        audience.push({ departments: { some: { departmentId: placement.departmentId } } });
      }
    }
    return {
      AND: [
        { status: 'published' },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: audience },
      ],
    };
  }

  private async visible(id: string, userId: string) {
    const row = await this.db.client.announcement.findFirst({
      where: { AND: [{ id }, await this.visibleTo(userId)] },
      select: FEED_SELECT,
    });
    if (!row) throw new NotFoundException('Comunicado não encontrado.');
    return row;
  }

  private async record(
    announcementId: string,
    grant: AccessGrant,
    kinds: ('viewed' | 'acknowledged')[],
    reader: ReaderInfo,
  ): Promise<void> {
    const employee = await this.db.client.employee.findUnique({
      where: { userId: grant.userId },
      select: { id: true },
    });
    // Append-only: repetir a leitura não cria nem altera registro.
    await this.db.client.announcementRead.createMany({
      data: kinds.map((kind) => ({
        companyId: grant.companyId,
        announcementId,
        userId: grant.userId,
        employeeId: employee?.id ?? null,
        kind,
        ip: reader.ip,
        userAgent: reader.userAgent?.slice(0, 500) ?? null,
      })),
      skipDuplicates: true,
    });
  }

  private async readsOf(userId: string, ids: string[]) {
    const reads = ids.length
      ? await this.db.client.announcementRead.findMany({
          where: { userId, announcementId: { in: ids } },
          select: { announcementId: true, kind: true, createdAt: true },
        })
      : [];
    const byAnnouncement = new Map<
      string,
      { viewedAt: Date | null; acknowledgedAt: Date | null }
    >();
    for (const read of reads) {
      const entry = byAnnouncement.get(read.announcementId) ?? {
        viewedAt: null,
        acknowledgedAt: null,
      };
      if (read.kind === 'viewed') entry.viewedAt = read.createdAt;
      else entry.acknowledgedAt = read.createdAt;
      byAnnouncement.set(read.announcementId, entry);
    }
    return byAnnouncement;
  }

  /** Quem gerencia vê o que criou e o que está dentro do seu escopo. */
  private manageable(row: AnnouncementRow, scope: DataScope, grant: AccessGrant): boolean {
    return row.createdBy === grant.userId || canAddress(scope, audienceOf(row));
  }

  private async managed(id: string, grant: AccessGrant): Promise<AnnouncementRow> {
    const row = await this.db.client.announcement.findUnique({
      where: { id },
      select: ANNOUNCEMENT_SELECT,
    });
    // Fora do escopo responde como inexistente.
    if (!row || !this.manageable(row, requireScope(grant), grant)) {
      throw new NotFoundException('Comunicado não encontrado.');
    }
    return row;
  }

  private async checkAudience(audience: Audience, grant: AccessGrant): Promise<void> {
    const unitIds = [...new Set(audience.unitIds)];
    const departmentIds = [...new Set(audience.departmentIds)];
    const [units, departments] = await Promise.all([
      unitIds.length ? this.db.client.unit.count({ where: { id: { in: unitIds } } }) : 0,
      departmentIds.length
        ? this.db.client.department.count({ where: { id: { in: departmentIds } } })
        : 0,
    ]);
    if (units !== unitIds.length) {
      throw invalidReference('audience.unitIds', 'Unidade não encontrada.');
    }
    if (departments !== departmentIds.length) {
      throw invalidReference('audience.departmentIds', 'Departamento não encontrado.');
    }
    if (!canAddress(requireScope(grant), { unitIds, departmentIds })) {
      throw invalidReference(
        'audience',
        'Seu acesso só permite comunicados para as unidades e departamentos do seu escopo.',
      );
    }
  }

  private async writeAudience(
    tx: Tx,
    announcementId: string,
    audience: Audience,
    companyId: string,
  ): Promise<void> {
    const unitIds = [...new Set(audience.unitIds)];
    const departmentIds = [...new Set(audience.departmentIds)];
    if (unitIds.length) {
      await tx.announcementUnit.createMany({
        data: unitIds.map((unitId) => ({ announcementId, unitId, companyId })),
      });
    }
    if (departmentIds.length) {
      await tx.announcementDepartment.createMany({
        data: departmentIds.map((departmentId) => ({ announcementId, departmentId, companyId })),
      });
    }
  }

  private async toAnnouncements(rows: AnnouncementRow[]): Promise<Announcement[]> {
    const ids = rows.map((r) => r.id);
    const counts = ids.length
      ? await this.db.client.announcementRead.groupBy({
          by: ['announcementId', 'kind'],
          where: { announcementId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const count = (id: string, kind: 'viewed' | 'acknowledged') =>
      counts.find((c) => c.announcementId === id && c.kind === kind)?._count._all ?? 0;
    return rows.map((row) => {
      const audience = audienceOf(row);
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        requiresAcknowledgment: row.requiresAcknowledgment,
        status: row.status,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        archivedAt: row.archivedAt?.toISOString() ?? null,
        audience: {
          companyWide: isCompanyWide(audience),
          units: row.units.map((u) => u.unit),
          departments: row.departments.map((d) => d.department),
        },
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        stats: { viewed: count(row.id, 'viewed'), acknowledged: count(row.id, 'acknowledged') },
      };
    });
  }
}

function toMine(
  row: Prisma.AnnouncementGetPayload<{ select: typeof FEED_SELECT }>,
  reads: { viewedAt: Date | null; acknowledgedAt: Date | null } | undefined,
): MyAnnouncement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    requiresAcknowledgment: row.requiresAcknowledgment,
    // Visíveis no mural são sempre publicados.
    publishedAt: (row.publishedAt ?? new Date(0)).toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    viewedAt: reads?.viewedAt?.toISOString() ?? null,
    acknowledgedAt: reads?.acknowledgedAt?.toISOString() ?? null,
  };
}

function toAuditAudience(audience: Audience) {
  return { unitIds: [...audience.unitIds], departmentIds: [...audience.departmentIds] };
}
