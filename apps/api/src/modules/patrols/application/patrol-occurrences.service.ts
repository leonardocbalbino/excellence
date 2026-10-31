import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type DownloadLink,
  type PatrolOccurrence,
  type patrolOccurrenceInputSchema,
  type patrolOccurrenceListQuerySchema,
  type patrolOccurrenceResolutionSchema,
  ProblemType,
  type UnitPatrolSummary,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { Prisma } from '../../../generated/prisma/client';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { FilesService } from '../../files/application/files.service';
import { MailSender } from '../../notifications/application/mail-sender';
import { invalidReference } from '../../organization/application/catalog-rules';
import { CompanyService } from '../../organization/application/company.service';
import { addDays } from '../../scheduling/domain/planner';
import { fromZoned, toZoned } from '../../time-tracking/domain/zoned-time';
import { EmployeesService } from '../../workforce/application/employees.service';
import { todayIn } from '../../workforce/domain/calendar';
import { employeeScopeWhere } from '../../workforce/domain/employee-scope';
import { occurrenceEmail } from '../domain/occurrence-email';
import { slotsOn } from '../domain/schedule';

type OccurrenceInput = z.output<typeof patrolOccurrenceInputSchema>;
type ResolutionInput = z.output<typeof patrolOccurrenceResolutionSchema>;
type ListQuery = z.output<typeof patrolOccurrenceListQuerySchema>;

/** A ocorrência pode ser registrada até este tempo depois do início da ronda. */
const REPORT_WINDOW_MS = 24 * 60 * 60_000;
const LIST_LIMIT = 500;

const OCCURRENCE_SELECT = {
  id: true,
  number: true,
  runId: true,
  occurredAt: true,
  description: true,
  photoFileId: true,
  status: true,
  actionTaken: true,
  resolution: true,
  resolvedAt: true,
  emailedAt: true,
  emailError: true,
  unit: { select: { id: true, name: true, timezone: true, occurrenceEmails: true } },
  run: { select: { route: { select: { id: true, name: true } } } },
  point: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true, socialName: true } },
  resolver: { select: { id: true, name: true } },
} as const satisfies Prisma.PatrolOccurrenceSelect;

type OccurrenceRow = Prisma.PatrolOccurrenceGetPayload<{ select: typeof OCCURRENCE_SELECT }>;

function toOccurrence(row: OccurrenceRow, companyTz: string): PatrolOccurrence {
  const local = toZoned(row.occurredAt, row.unit.timezone ?? companyTz);
  return {
    id: row.id,
    number: row.number,
    unit: { id: row.unit.id, name: row.unit.name },
    route: row.run?.route ?? null,
    runId: row.runId,
    point: row.point,
    employee: { id: row.employee.id, name: row.employee.socialName ?? row.employee.name },
    occurredAt: row.occurredAt.toISOString(),
    localDate: local.date,
    localTime: local.time,
    description: row.description,
    hasPhoto: row.photoFileId !== null,
    status: row.status,
    actionTaken: row.actionTaken,
    resolution: row.resolution,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolver,
    emailedAt: row.emailedAt?.toISOString() ?? null,
    emailError: row.emailError,
  };
}

/** "2026-10" → primeiro dia do mês e do mês seguinte (AAAA-MM-DD). */
function monthBounds(month: string): { first: string; next: string } {
  const first = `${month}-01`;
  return { first, next: addDays(first, 32).slice(0, 8) + '01' };
}

/**
 * Ocorrências das rondas (ADR 0024). O funcionário registra durante a ronda o que viu (ponto,
 * horário, descrição e foto); a ocorrência recebe um número único na empresa e vai por e-mail
 * aos destinatários do posto. A administração completa o que foi feito e a resolução. O
 * registro do funcionário não muda depois (trigger no banco).
 */
@Injectable()
export class PatrolOccurrencesService {
  private readonly logger = new Logger(PatrolOccurrencesService.name);

  constructor(
    private readonly db: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly mail: MailSender,
    private readonly company: CompanyService,
    private readonly employees: EmployeesService,
  ) {}

  // ─── Funcionário ──────────────────────────────────────────────────────────────────

  async report(
    runId: string,
    input: OccurrenceInput,
    grant: AccessGrant,
  ): Promise<PatrolOccurrence> {
    const run = await this.db.client.patrolRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        unitId: true,
        pointIds: true,
        startedAt: true,
        employee: { select: { id: true, userId: true } },
      },
    });
    // Ronda de outra pessoa responde como inexistente.
    if (run?.employee.userId !== grant.userId) throw new NotFoundException('Ronda não encontrada.');
    if (Date.now() - run.startedAt.getTime() > REPORT_WINDOW_MS) {
      throw new ProblemException({
        type: ProblemType.PatrolRunFinished,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'Passou o prazo de 24 h desta ronda. Registre a ocorrência numa ronda atual.',
      });
    }
    if (input.pointId && !run.pointIds.includes(input.pointId)) {
      throw invalidReference('pointId', 'Este ponto não faz parte da ronda.');
    }
    if (input.photoFileId) {
      const file = await this.files.getOwn(input.photoFileId).catch(() => null);
      if (file?.status !== 'uploaded' || file.purpose !== 'patrol_occurrence') {
        throw invalidReference('photoFileId', 'Foto não encontrada ou ainda não enviada.');
      }
    }

    const id = await this.db.client.$transaction(async (tx) => {
      // Número único: incremento atômico do contador da empresa.
      const [counter] = await tx.$queryRaw<{ last_number: number }[]>`
        INSERT INTO occurrence_counters (company_id, last_number)
        VALUES (${grant.companyId}::uuid, 1)
        ON CONFLICT (company_id)
        DO UPDATE SET last_number = occurrence_counters.last_number + 1
        RETURNING last_number`;
      if (!counter) throw new Error('Contador de ocorrências não retornou o número');
      const created = await tx.patrolOccurrence.create({
        data: {
          companyId: grant.companyId,
          number: counter.last_number,
          unitId: run.unitId,
          runId: run.id,
          pointId: input.pointId ?? null,
          employeeId: run.employee.id,
          occurredAt: new Date(),
          description: input.description,
          photoFileId: input.photoFileId ?? null,
        },
        select: { id: true, number: true },
      });
      await this.audit.record(
        {
          action: 'patrol_occurrence.reported',
          resourceType: 'patrol_occurrence',
          resourceId: created.id,
          metadata: { number: created.number, runId: run.id },
        },
        tx,
      );
      return created.id;
    });
    // O e-mail sai em segundo plano; o resultado fica gravado na ocorrência.
    void this.sendEmail(id).catch((error: unknown) => {
      this.logger.warn({ err: error, id }, 'Falha no e-mail da ocorrência');
    });
    return this.get(id);
  }

  // ─── Gestão ───────────────────────────────────────────────────────────────────────

  async list(query: ListQuery, grant: AccessGrant): Promise<PatrolOccurrence[]> {
    const scope = await this.scopeWhere(grant);
    if (!scope) return [];
    const companyTz = await this.company.timezone();
    const where: Prisma.PatrolOccurrenceWhereInput = {
      employee: scope,
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    if (query.month) {
      // Mês no fuso da empresa (um posto em outro fuso pode deslocar poucas horas).
      const { first, next } = monthBounds(query.month);
      where.occurredAt = {
        gte: fromZoned(first, '00:00', companyTz),
        lt: fromZoned(next, '00:00', companyTz),
      };
    }
    const rows = await this.db.client.patrolOccurrence.findMany({
      where,
      select: OCCURRENCE_SELECT,
      orderBy: { occurredAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map((row) => toOccurrence(row, companyTz));
  }

  async get(id: string, grant?: AccessGrant): Promise<PatrolOccurrence> {
    const row = await this.row(id, grant);
    return toOccurrence(row, await this.company.timezone());
  }

  async photo(id: string, grant: AccessGrant): Promise<DownloadLink> {
    const row = await this.db.client.patrolOccurrence.findFirst({
      where: { id, ...(await this.scopedEmployee(grant)) },
      select: { photoFileId: true },
    });
    if (!row?.photoFileId) throw new NotFoundException('Ocorrência sem foto.');
    return this.files.createDownloadLink(row.photoFileId, 'inline');
  }

  async resolve(id: string, input: ResolutionInput, grant: AccessGrant): Promise<PatrolOccurrence> {
    await this.row(id, grant);
    const resolved = input.resolution !== null;
    await this.db.client.$transaction(async (tx) => {
      await tx.patrolOccurrence.update({
        where: { id },
        data: {
          actionTaken: input.actionTaken,
          resolution: input.resolution,
          status: resolved ? 'resolved' : 'open',
          resolvedAt: resolved ? new Date() : null,
          resolvedBy: resolved ? grant.userId : null,
        },
      });
      await this.audit.record(
        {
          action: resolved ? 'patrol_occurrence.resolved' : 'patrol_occurrence.updated',
          resourceType: 'patrol_occurrence',
          resourceId: id,
        },
        tx,
      );
    });
    return this.get(id, grant);
  }

  /** Reenvia o e-mail (ex.: depois de cadastrar os destinatários ou configurar o SMTP). */
  async resend(id: string, grant: AccessGrant): Promise<PatrolOccurrence> {
    await this.row(id, grant);
    await this.sendEmail(id);
    return this.get(id, grant);
  }

  /** Resumo do mês das rondas do posto: horários, rondas feitas e as ocorrências. */
  async unitSummary(unitId: string, month: string, grant: AccessGrant): Promise<UnitPatrolSummary> {
    const unit = await this.db.client.unit.findUnique({
      where: { id: unitId },
      select: { id: true, name: true, timezone: true },
    });
    if (!unit) throw new NotFoundException('Posto de trabalho não encontrado.');
    const companyTz = await this.company.timezone();
    const timezone = unit.timezone ?? companyTz;
    const now = new Date();
    const today = todayIn(timezone, now);
    const { first, next } = monthBounds(month);
    const from = fromZoned(first, '00:00', timezone);
    const to = fromZoned(next, '00:00', timezone);

    const [routes, runs] = await Promise.all([
      this.db.client.patrolRoute.findMany({
        where: { unitId },
        select: {
          id: true,
          name: true,
          expectedMinutes: true,
          startMinutes: true,
          weekdays: true,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.db.client.patrolRun.findMany({
        where: { unitId, startedAt: { gte: from, lt: to } },
        select: { routeId: true, status: true, scheduledFor: true },
      }),
    ]);

    const lines: UnitPatrolSummary['routes'] = [];
    for (const route of routes) {
      const routeRuns = runs.filter((r) => r.routeId === route.id);
      const taken = new Set(routeRuns.map((r) => r.scheduledFor?.getTime()));
      let scheduled = 0;
      let missed = 0;
      // Horários previstos do mês até hoje (rotas inativas não preveem nada).
      for (let date = first; date < next && date <= today; date = addDays(date, 1)) {
        if (!route.isActive) break;
        for (const slot of slotsOn(route, date, timezone)) {
          if (slot.getTime() > now.getTime()) continue;
          scheduled += 1;
          const ended = slot.getTime() + route.expectedMinutes * 60_000 < now.getTime();
          if (ended && !taken.has(slot.getTime())) missed += 1;
        }
      }
      const completed = routeRuns.filter((r) => r.status === 'completed').length;
      const incomplete = routeRuns.filter((r) => r.status === 'incomplete').length;
      if (scheduled + completed + incomplete === 0) continue;
      lines.push({
        route: { id: route.id, name: route.name },
        scheduled,
        completed,
        incomplete,
        missed,
      });
    }

    const occurrences = await this.list({ unitId, month }, grant);
    const sum = (pick: (l: (typeof lines)[number]) => number) =>
      lines.reduce((total, line) => total + pick(line), 0);
    return {
      unit: { id: unit.id, name: unit.name },
      month,
      totals: {
        scheduled: sum((l) => l.scheduled),
        completed: sum((l) => l.completed),
        incomplete: sum((l) => l.incomplete),
        missed: sum((l) => l.missed),
        occurrences: occurrences.length,
        openOccurrences: occurrences.filter((o) => o.status === 'open').length,
      },
      routes: lines,
      occurrences,
    };
  }

  // ─── Interno ──────────────────────────────────────────────────────────────────────

  private async sendEmail(id: string): Promise<void> {
    const row = await this.db.client.patrolOccurrence.findUniqueOrThrow({
      where: { id },
      select: OCCURRENCE_SELECT,
    });
    const occurrence = toOccurrence(row, await this.company.timezone());
    const [y, m, d] = occurrence.localDate.split('-');
    const message = occurrenceEmail({
      number: occurrence.number,
      unit: occurrence.unit.name,
      route: occurrence.route?.name ?? null,
      point: occurrence.point?.name ?? null,
      employee: occurrence.employee.name,
      when: `${d ?? ''}/${m ?? ''}/${y ?? ''} ${occurrence.localTime}`,
      description: occurrence.description,
      hasPhoto: occurrence.hasPhoto,
      actionUrl: this.mail.link('/gestao/rondas/ocorrencias'),
    });
    const attachments = row.photoFileId
      ? await this.files
          .read(row.photoFileId)
          .then((file) => [
            {
              filename: `ocorrencia-${String(row.number)}-${file.originalName}`,
              content: file.content,
              contentType: file.contentType,
            },
          ])
          .catch(() => [])
      : [];
    const result = await this.mail.send({
      to: row.unit.occurrenceEmails,
      ...message,
      attachments,
    });
    await this.db.client.patrolOccurrence.update({
      where: { id },
      data: result.sent
        ? { emailedAt: new Date(), emailError: null }
        : { emailError: result.error },
    });
  }

  /** Funcionários no escopo de quem consulta (sem o próprio cadastro: segregação). */
  private async scopeWhere(grant: AccessGrant): Promise<Prisma.EmployeeWhereInput | null> {
    if (!grant.scope) return null;
    const actor = await this.employees.actor(grant);
    const where = employeeScopeWhere(grant.scope, actor);
    if (!where) return null;
    return actor.employeeId ? { AND: [where, { id: { not: actor.employeeId } }] } : where;
  }

  private async scopedEmployee(grant: AccessGrant): Promise<Prisma.PatrolOccurrenceWhereInput> {
    const scope = await this.scopeWhere(grant);
    // Sem escopo: nada passa (id impossível).
    return scope ? { employee: scope } : { id: '00000000-0000-0000-0000-000000000000' };
  }

  /** Ocorrência no escopo de quem consulta; sem `grant`, uso interno (já autorizado). */
  private async row(id: string, grant?: AccessGrant): Promise<OccurrenceRow> {
    const row = await this.db.client.patrolOccurrence.findFirst({
      where: { id, ...(grant ? await this.scopedEmployee(grant) : {}) },
      select: OCCURRENCE_SELECT,
    });
    if (!row) throw new NotFoundException('Ocorrência não encontrada.');
    return row;
  }
}
