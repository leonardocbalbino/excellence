import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../../common/context/request-context';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface AuditEvent {
  /** Verbo no passado com o domínio de prefixo: "auth.login_succeeded", "role.updated". */
  action: string;
  resourceType?: string;
  resourceId?: string;
  /** Contexto do evento. Nunca inclua segredos, senhas, tokens ou dados sensíveis em claro. */
  metadata?: Prisma.InputJsonValue;
  /** Preenchidos a partir do RequestContext quando omitidos. */
  companyId?: string;
  actorUserId?: string | null;
  actorIp?: string | null;
  requestId?: string | null;
}

/** Converte um valor qualquer (ex.: params e query do Express) em JSON gravável. */
export function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/** Qualquer client (base, isolado ou transação) com acesso a `auditLog.create`. */
export interface AuditWriter {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> };
}

/**
 * Grava a trilha de auditoria (append-only). Quando a ação faz parte de uma transação,
 * passe o `tx` para o registro ser gravado (ou desfeito) junto com a mudança.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent, writer: AuditWriter = this.prisma): Promise<void> {
    const context = RequestContext.current();
    const companyId = event.companyId ?? context?.companyId;
    if (!companyId) throw new Error(`Evento de auditoria sem empresa: ${event.action}`);

    await writer.auditLog.create({
      data: {
        companyId,
        action: event.action,
        resourceType: event.resourceType ?? null,
        resourceId: event.resourceId ?? null,
        ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
        actorUserId:
          event.actorUserId === undefined ? (context?.userId ?? null) : event.actorUserId,
        actorIp: event.actorIp === undefined ? (context?.ip ?? null) : event.actorIp,
        requestId: event.requestId === undefined ? (context?.requestId ?? null) : event.requestId,
      },
    });
  }
}
