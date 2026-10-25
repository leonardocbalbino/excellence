import { formatTicketNumber } from '@excellence/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PushSender } from './push-sender';

export interface AnnouncementAudience {
  /** Vazios = empresa toda. */
  unitIds: readonly string[];
  departmentIds: readonly string[];
}

/**
 * Notificações dos acontecimentos do funcionário (ADR 0022): comunicado publicado, ajuste de
 * ponto e atestado decididos. Chamado depois que a mudança foi gravada; o envio não bloqueia
 * a resposta nem desfaz nada se falhar.
 */
@Injectable()
export class Notifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
  ) {}

  /** Funcionários ativos hoje no público do comunicado, que têm conta de acesso. */
  async announcementPublished(
    companyId: string,
    announcement: { title: string; requiresAcknowledgment: boolean },
    audience: AnnouncementAudience,
  ): Promise<void> {
    if (!this.push.enabled) return;
    const today = new Date(new Date().toISOString().slice(0, 10));
    const companyWide = audience.unitIds.length === 0 && audience.departmentIds.length === 0;
    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        userId: { not: null },
        hireDate: { lte: today },
        OR: [{ terminationDate: null }, { terminationDate: { gte: today } }],
        ...(companyWide
          ? {}
          : {
              AND: [
                {
                  OR: [
                    { unitId: { in: [...audience.unitIds] } },
                    { departmentId: { in: [...audience.departmentIds] } },
                  ],
                },
              ],
            }),
      },
      select: { userId: true },
    });
    this.push.notify(
      companyId,
      employees.map((e) => e.userId).filter((id): id is string => id !== null),
      {
        title: announcement.requiresAcknowledgment
          ? 'Comunicado: ciência pendente'
          : 'Novo comunicado',
        body: announcement.title,
        data: { kind: 'announcement', url: '/comunicados' },
      },
    );
  }

  async adjustmentDecided(
    companyId: string,
    employeeId: string,
    approved: boolean,
    note: string | null,
  ): Promise<void> {
    await this.toEmployee(companyId, employeeId, {
      title: approved ? 'Ajuste de ponto aprovado' : 'Ajuste de ponto recusado',
      body: approved
        ? 'Seu pedido de ajuste foi aprovado e já está no espelho de ponto.'
        : `Seu pedido de ajuste foi recusado${note ? `: ${note}` : '.'}`,
      data: { kind: 'adjustment_decided', url: '/espelho' },
    });
  }

  async certificateReviewed(
    companyId: string,
    employeeId: string,
    status: 'accepted' | 'rejected',
  ): Promise<void> {
    await this.toEmployee(companyId, employeeId, {
      title: status === 'accepted' ? 'Atestado válido' : 'Atestado inválido',
      body:
        status === 'accepted'
          ? 'Seu atestado foi analisado e aceito pelo RH.'
          : 'Seu atestado foi analisado e não foi aceito. Fale com o RH para entender.',
      data: { kind: 'certificate_reviewed', url: '/espelho' },
    });
  }

  /** Resposta do RH num chamado: o toque abre a conversa no app. */
  async conversationReplied(
    companyId: string,
    employeeId: string,
    conversation: { id: string; number: number; subject: string; preview: string },
  ): Promise<void> {
    await this.toEmployee(companyId, employeeId, {
      title: `RH respondeu o chamado ${formatTicketNumber(conversation.number)}`,
      body:
        conversation.preview.length > 120
          ? `${conversation.preview.slice(0, 117)}…`
          : conversation.preview,
      data: { kind: 'conversation_reply', url: `/atendimento/${conversation.id}` },
    });
  }

  private async toEmployee(
    companyId: string,
    employeeId: string,
    message: Parameters<PushSender['notify']>[2],
  ): Promise<void> {
    if (!this.push.enabled) return;
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { userId: true },
    });
    if (employee?.userId) this.push.notify(companyId, [employee.userId], message);
  }
}
