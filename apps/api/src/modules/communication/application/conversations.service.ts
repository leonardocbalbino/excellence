import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ConversationDetail,
  type ConversationMessage,
  type conversationListQuerySchema,
  type conversationMessageInputSchema,
  type conversationStartSchema,
  type ConversationSummary,
  type DownloadLink,
  ProblemType,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import type { Prisma } from '../../../generated/prisma/client';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { DataScope } from '../../access-control/domain/data-scope';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { FilesService } from '../../files/application/files.service';
import { Notifier } from '../../notifications/application/notifier';
import { invalidReference } from '../../organization/application/catalog-rules';
import { EmployeesService } from '../../workforce/application/employees.service';
import { employeeScopeWhere } from '../../workforce/domain/employee-scope';

type StartInput = z.output<typeof conversationStartSchema>;
type MessageInput = z.output<typeof conversationMessageInputSchema>;
type ListQuery = z.output<typeof conversationListQuerySchema>;
type Side = 'employee' | 'hr';

const SUMMARY_SELECT = {
  id: true,
  number: true,
  category: true,
  subject: true,
  status: true,
  createdAt: true,
  closedAt: true,
  lastMessageAt: true,
  employeeReadAt: true,
  hrReadAt: true,
  employee: {
    select: {
      id: true,
      name: true,
      socialName: true,
      registrationNumber: true,
      userId: true,
      unit: { select: { id: true, name: true } },
    },
  },
  messages: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { side: true, body: true, createdAt: true },
  },
} as const satisfies Prisma.ConversationSelect;

type SummaryRow = Prisma.ConversationGetPayload<{ select: typeof SUMMARY_SELECT }>;

const MESSAGE_SELECT = {
  id: true,
  side: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
  attachment: { select: { id: true, originalName: true, contentType: true } },
} as const satisfies Prisma.ConversationMessageSelect;

type MessageRow = Prisma.ConversationMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

/** Prévia da última mensagem na lista. */
const PREVIEW_LENGTH = 140;
/** Limite da lista do RH (as encerradas mais antigas saem primeiro). */
const LIST_LIMIT = 500;

function closedProblem(): ProblemException {
  return new ProblemException({
    type: ProblemType.ConversationClosed,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail: 'O chamado está encerrado. Reabra para responder.',
  });
}

function noEmployee(): ProblemException {
  return new ProblemException({
    type: ProblemType.NoEmployeeRecord,
    title: 'Forbidden',
    status: HttpStatus.FORBIDDEN,
    detail: 'Seu usuário não está ligado a um cadastro de funcionário.',
  });
}

function toMessage(row: MessageRow, employeeName: string): ConversationMessage {
  return {
    id: row.id,
    side: row.side,
    // Do lado do funcionário vale o nome do cadastro (nome social, se houver).
    author: { id: row.author.id, name: row.side === 'employee' ? employeeName : row.author.name },
    body: row.body,
    attachment: row.attachment
      ? {
          id: row.attachment.id,
          name: row.attachment.originalName,
          contentType: row.attachment.contentType,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Atendimento (ADR 0023): o funcionário abre um chamado para o RH e conversa em formato de
 * bate-papo. Cada chamado tem um número único na empresa (sequencial, como o NSR do ponto).
 * As mensagens não são editadas nem excluídas (trigger no banco): são o registro.
 *
 * O RH atende com `conversations:manage`, no escopo da permissão (unidades, departamentos),
 * e nunca vê os próprios chamados (segregação, como no quadro do ponto).
 */
@Injectable()
export class ConversationsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly files: FilesService,
    private readonly employees: EmployeesService,
    private readonly audit: AuditService,
    private readonly notifier: Notifier,
  ) {}

  // ─── Funcionário ──────────────────────────────────────────────────────────────────

  async mine(grant: AccessGrant): Promise<ConversationSummary[]> {
    const employee = await this.ownEmployee(grant);
    const rows = await this.db.client.conversation.findMany({
      where: { employeeId: employee.id },
      select: SUMMARY_SELECT,
      orderBy: { lastMessageAt: 'desc' },
    });
    return this.toSummaries(rows, 'employee', grant.companyId);
  }

  async start(input: StartInput, grant: AccessGrant): Promise<ConversationDetail> {
    const employee = await this.ownEmployee(grant);
    await this.checkAttachment(input.attachmentFileId ?? null);
    const now = new Date();
    const id = await this.db.client.$transaction(async (tx) => {
      // Número único: incremento atômico do contador da empresa.
      const [counter] = await tx.$queryRaw<{ last_number: number }[]>`
        INSERT INTO conversation_counters (company_id, last_number)
        VALUES (${grant.companyId}::uuid, 1)
        ON CONFLICT (company_id)
        DO UPDATE SET last_number = conversation_counters.last_number + 1
        RETURNING last_number`;
      if (!counter) throw new Error('Contador de chamados não retornou o número');
      const conversation = await tx.conversation.create({
        data: {
          companyId: grant.companyId,
          number: counter.last_number,
          employeeId: employee.id,
          category: input.category,
          subject: input.subject,
          lastMessageAt: now,
          employeeReadAt: now,
        },
        select: { id: true, number: true },
      });
      await tx.conversationMessage.create({
        data: {
          companyId: grant.companyId,
          conversationId: conversation.id,
          side: 'employee',
          authorUserId: grant.userId,
          body: input.message,
          attachmentFileId: input.attachmentFileId ?? null,
          createdAt: now,
        },
      });
      await this.audit.record(
        {
          action: 'conversation.started',
          resourceType: 'conversation',
          resourceId: conversation.id,
          metadata: { number: conversation.number, category: input.category },
        },
        tx,
      );
      return conversation.id;
    });
    return this.detail(id, 'employee', grant.companyId);
  }

  /** Abrir marca como lidas as mensagens do RH. */
  async openMine(id: string, grant: AccessGrant): Promise<ConversationDetail> {
    await this.ownConversation(id, grant);
    await this.db.client.conversation.update({
      where: { id },
      data: { employeeReadAt: new Date() },
    });
    return this.detail(id, 'employee', grant.companyId);
  }

  /** Mensagem do funcionário. Num chamado encerrado, reabre o chamado. */
  async replyMine(
    id: string,
    input: MessageInput,
    grant: AccessGrant,
  ): Promise<ConversationMessage> {
    const conversation = await this.ownConversation(id, grant);
    await this.checkAttachment(input.attachmentFileId ?? null);
    return this.addMessage(
      conversation,
      'employee',
      input,
      grant,
      conversation.status === 'closed',
    );
  }

  async myUnread(grant: AccessGrant): Promise<{ conversations: number }> {
    const employee = await this.db.client.employee.findUnique({
      where: { userId: grant.userId },
      select: { id: true },
    });
    if (!employee) return { conversations: 0 };
    return { conversations: await this.countUnread('employee', grant.companyId, employee.id) };
  }

  // ─── RH ───────────────────────────────────────────────────────────────────────────

  async list(query: ListQuery, grant: AccessGrant): Promise<ConversationSummary[]> {
    const scope = await this.scopeWhere(grant);
    if (!scope) return [];
    const rows = await this.db.client.conversation.findMany({
      where: {
        employee: scope,
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
      },
      select: SUMMARY_SELECT,
      // Abertos primeiro, depois os de mensagem mais recente.
      orderBy: [{ status: 'desc' }, { lastMessageAt: 'desc' }],
      take: LIST_LIMIT,
    });
    return this.toSummaries(rows, 'hr', grant.companyId);
  }

  /** Abrir marca como lidas as mensagens do funcionário (para todo o RH). */
  async get(id: string, grant: AccessGrant): Promise<ConversationDetail> {
    await this.managed(id, grant);
    await this.db.client.conversation.update({ where: { id }, data: { hrReadAt: new Date() } });
    return this.detail(id, 'hr', grant.companyId);
  }

  async reply(id: string, input: MessageInput, grant: AccessGrant): Promise<ConversationMessage> {
    const conversation = await this.managed(id, grant);
    if (conversation.status === 'closed') throw closedProblem();
    await this.checkAttachment(input.attachmentFileId ?? null);
    const message = await this.addMessage(conversation, 'hr', input, grant, false);
    // Push ao funcionário (ADR 0022); não atrasa nem desfaz a resposta.
    await this.notifier.conversationReplied(grant.companyId, conversation.employeeId, {
      id,
      number: conversation.number,
      subject: conversation.subject,
      preview: input.body,
    });
    return message;
  }

  async close(id: string, grant: AccessGrant): Promise<ConversationSummary> {
    const conversation = await this.managed(id, grant);
    if (conversation.status === 'open') {
      await this.db.client.$transaction(async (tx) => {
        await tx.conversation.update({
          where: { id },
          data: { status: 'closed', closedAt: new Date(), closedBy: grant.userId },
        });
        await this.audit.record(
          {
            action: 'conversation.closed',
            resourceType: 'conversation',
            resourceId: id,
            metadata: { number: conversation.number },
          },
          tx,
        );
      });
    }
    return this.summary(id, 'hr', grant.companyId);
  }

  async reopen(id: string, grant: AccessGrant): Promise<ConversationSummary> {
    const conversation = await this.managed(id, grant);
    if (conversation.status === 'closed') {
      await this.db.client.$transaction(async (tx) => {
        await tx.conversation.update({
          where: { id },
          data: { status: 'open', closedAt: null, closedBy: null },
        });
        await this.audit.record(
          {
            action: 'conversation.reopened',
            resourceType: 'conversation',
            resourceId: id,
            metadata: { number: conversation.number, by: 'hr' },
          },
          tx,
        );
      });
    }
    return this.summary(id, 'hr', grant.companyId);
  }

  async unread(grant: AccessGrant): Promise<{ conversations: number }> {
    const scope = await this.scopeWhere(grant);
    if (!scope) return { conversations: 0 };
    const ids = await this.db.client.conversation.findMany({
      where: { employee: scope, status: 'open' },
      select: { id: true },
      take: LIST_LIMIT,
    });
    if (ids.length === 0) return { conversations: 0 };
    const unread = await this.unreadByConversation(
      ids.map((c) => c.id),
      'hr',
      grant.companyId,
    );
    return { conversations: [...unread.values()].filter((n) => n > 0).length };
  }

  // ─── Anexos ───────────────────────────────────────────────────────────────────────

  /**
   * Link temporário de um anexo. Vale para o próprio funcionário do chamado e para o RH com
   * `conversations:manage` no escopo. O arquivo precisa ser de uma mensagem do chamado.
   */
  async attachment(id: string, fileId: string, grant: AccessGrant): Promise<DownloadLink> {
    const conversation = await this.db.client.conversation.findUnique({
      where: { id },
      select: { id: true, employee: { select: { userId: true } } },
    });
    if (!conversation) throw new NotFoundException('Chamado não encontrado.');
    const own = conversation.employee.userId === grant.userId;
    if (!own) await this.managed(id, grant, grant.access?.permissions.get('conversations:manage'));
    const message = await this.db.client.conversationMessage.count({
      where: { conversationId: id, attachmentFileId: fileId },
    });
    if (message === 0) throw new NotFoundException('Anexo não encontrado.');
    return this.files.createDownloadLink(fileId, 'inline');
  }

  // ─── Interno ──────────────────────────────────────────────────────────────────────

  private async addMessage(
    conversation: { id: string; number: number },
    side: Side,
    input: MessageInput,
    grant: AccessGrant,
    reopen: boolean,
  ): Promise<ConversationMessage> {
    const now = new Date();
    const row = await this.db.client.$transaction(async (tx) => {
      const message = await tx.conversationMessage.create({
        data: {
          companyId: grant.companyId,
          conversationId: conversation.id,
          side,
          authorUserId: grant.userId,
          body: input.body,
          attachmentFileId: input.attachmentFileId ?? null,
          createdAt: now,
        },
        select: {
          ...MESSAGE_SELECT,
          conversation: { select: { employee: { select: { name: true, socialName: true } } } },
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: now,
          ...(side === 'employee' ? { employeeReadAt: now } : { hrReadAt: now }),
          ...(reopen ? { status: 'open', closedAt: null, closedBy: null } : {}),
        },
      });
      if (reopen) {
        await this.audit.record(
          {
            action: 'conversation.reopened',
            resourceType: 'conversation',
            resourceId: conversation.id,
            metadata: { number: conversation.number, by: 'employee' },
          },
          tx,
        );
      }
      return message;
    });
    const employee = row.conversation.employee;
    return toMessage(row, employee.socialName ?? employee.name);
  }

  private async checkAttachment(fileId: string | null): Promise<void> {
    if (!fileId) return;
    const file = await this.files.getOwn(fileId).catch(() => null);
    if (file?.status !== 'uploaded' || file.purpose !== 'conversation_attachment') {
      throw invalidReference('attachmentFileId', 'Anexo não encontrado ou ainda não enviado.');
    }
  }

  private async ownEmployee(grant: AccessGrant) {
    const employee = await this.db.client.employee.findUnique({
      where: { userId: grant.userId },
      select: { id: true },
    });
    if (!employee) throw noEmployee();
    return employee;
  }

  /** Chamado do próprio funcionário; o de outra pessoa responde como inexistente. */
  private async ownConversation(id: string, grant: AccessGrant) {
    const employee = await this.ownEmployee(grant);
    const conversation = await this.db.client.conversation.findFirst({
      where: { id, employeeId: employee.id },
      select: { id: true, number: true, status: true, subject: true, employeeId: true },
    });
    if (!conversation) throw new NotFoundException('Chamado não encontrado.');
    return conversation;
  }

  /** Filtro de funcionários do escopo do RH, sem o próprio cadastro de quem atende. */
  private async scopeWhere(
    grant: AccessGrant,
    scope: DataScope | undefined = grant.scope,
  ): Promise<Prisma.EmployeeWhereInput | null> {
    if (!scope) return null;
    const actor = await this.employees.actor(grant);
    const where = employeeScopeWhere(scope, actor);
    if (!where) return null;
    return actor.employeeId ? { AND: [where, { id: { not: actor.employeeId } }] } : where;
  }

  /** Chamado no escopo do RH; fora dele responde como inexistente. */
  private async managed(id: string, grant: AccessGrant, scope?: DataScope) {
    const where = await this.scopeWhere(grant, scope ?? grant.scope);
    const conversation = where
      ? await this.db.client.conversation.findFirst({
          where: { id, employee: where },
          select: { id: true, number: true, status: true, subject: true, employeeId: true },
        })
      : null;
    if (!conversation) throw new NotFoundException('Chamado não encontrado.');
    return conversation;
  }

  private async summary(id: string, viewer: Side, companyId: string): Promise<ConversationSummary> {
    const row = await this.db.client.conversation.findUniqueOrThrow({
      where: { id },
      select: SUMMARY_SELECT,
    });
    const [summary] = await this.toSummaries([row], viewer, companyId);
    if (!summary) throw new NotFoundException('Chamado não encontrado.');
    return summary;
  }

  private async detail(id: string, viewer: Side, companyId: string): Promise<ConversationDetail> {
    const summary = await this.summary(id, viewer, companyId);
    const messages = await this.db.client.conversationMessage.findMany({
      where: { conversationId: id },
      select: MESSAGE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return { ...summary, messages: messages.map((m) => toMessage(m, summary.employee.name)) };
  }

  private async toSummaries(
    rows: SummaryRow[],
    viewer: Side,
    companyId: string,
  ): Promise<ConversationSummary[]> {
    const unread = await this.unreadByConversation(
      rows.map((r) => r.id),
      viewer,
      companyId,
    );
    return rows.map((row) => {
      const last = row.messages[0];
      return {
        id: row.id,
        number: row.number,
        category: row.category,
        subject: row.subject,
        status: row.status,
        employee: {
          id: row.employee.id,
          name: row.employee.socialName ?? row.employee.name,
          registrationNumber: row.employee.registrationNumber,
        },
        unit: row.employee.unit,
        lastMessage: {
          side: last?.side ?? 'employee',
          preview: (last?.body ?? '').slice(0, PREVIEW_LENGTH),
          at: (last?.createdAt ?? row.lastMessageAt).toISOString(),
        },
        unread: unread.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Mensagens do outro lado depois da última leitura de quem consulta. SQL direto (a
   * comparação é com uma coluna do próprio chamado), com a empresa explícita.
   */
  private async unreadByConversation(
    ids: string[],
    viewer: Side,
    companyId: string,
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows =
      viewer === 'employee'
        ? await this.db.client.$queryRaw<{ id: string; unread: number }[]>`
            SELECT c.id, count(m.id)::int AS unread
            FROM conversations c
            JOIN conversation_messages m ON m.conversation_id = c.id
            WHERE c.company_id = ${companyId}::uuid AND c.id = ANY(${ids}::uuid[])
              AND m.side = 'hr' AND m.created_at > COALESCE(c.employee_read_at, '-infinity')
            GROUP BY c.id`
        : await this.db.client.$queryRaw<{ id: string; unread: number }[]>`
            SELECT c.id, count(m.id)::int AS unread
            FROM conversations c
            JOIN conversation_messages m ON m.conversation_id = c.id
            WHERE c.company_id = ${companyId}::uuid AND c.id = ANY(${ids}::uuid[])
              AND m.side = 'employee' AND m.created_at > COALESCE(c.hr_read_at, '-infinity')
            GROUP BY c.id`;
    return new Map(rows.map((r) => [r.id, r.unread]));
  }

  private async countUnread(viewer: Side, companyId: string, employeeId: string): Promise<number> {
    const ids = await this.db.client.conversation.findMany({
      where: { employeeId },
      select: { id: true },
    });
    const unread = await this.unreadByConversation(
      ids.map((c) => c.id),
      viewer,
      companyId,
    );
    return [...unread.values()].filter((n) => n > 0).length;
  }
}
