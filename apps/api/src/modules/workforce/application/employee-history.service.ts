import { Injectable } from '@nestjs/common';
import type { EmployeeHistoryEvent, Permission } from '@excellence/shared';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { fromCalendarDate } from '../domain/calendar';
import { brDate, employeeChanges } from '../domain/employee-history';
import { EmployeesService } from './employees.service';

type Snapshot = Record<string, unknown>;

const ADJUSTMENT_STATUS: Record<string, string> = {
  approved: 'aprovado',
  rejected: 'recusado',
  cancelled: 'cancelado',
};
const CERTIFICATE_STATUS: Record<string, string> = {
  accepted: 'válido',
  rejected: 'inválido',
  cancelled: 'cancelado',
};

function asSnapshot(value: unknown): Snapshot {
  return value && typeof value === 'object' ? (value as Snapshot) : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function money(value: unknown): string {
  return typeof value === 'number'
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
}

/** Data de calendário como instante (meio-dia UTC) para ordenar junto com os demais. */
function dayInstant(date: string): string {
  return `${date}T12:00:00.000Z`;
}

/**
 * Linha do tempo do funcionário, montada a partir da auditoria e dos registros de atestados
 * e ajustes. Cada fonte só entra com a permissão do módulo (quem tem só `employees:read` vê o
 * cadastro, a conta e as escalas).
 */
@Injectable()
export class EmployeeHistoryService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly employees: EmployeesService,
  ) {}

  async history(employeeId: string, grant: AccessGrant): Promise<EmployeeHistoryEvent[]> {
    // Fora do escopo responde como inexistente (mesma regra do cadastro).
    const employee = await this.employees.get(employeeId, grant);
    const can = (permission: Permission) => grant.access?.permissions.has(permission) ?? false;
    const canSeeBenefitValues = can('benefits:manage');

    const events: EmployeeHistoryEvent[] = [];
    const actorIds = new Set<string>();
    const pending: { event: EmployeeHistoryEvent; actorId: string | null }[] = [];
    const push = (event: Omit<EmployeeHistoryEvent, 'actor'>, actorId: string | null) => {
      if (actorId) actorIds.add(actorId);
      pending.push({ event: { ...event, actor: null }, actorId });
    };

    push(
      {
        id: `hired-${employee.id}`,
        at: dayInstant(employee.hireDate),
        dateOnly: true,
        kind: 'hired',
        title: 'Admissão',
        description: [employee.position?.name, employee.unit.name].filter(Boolean).join(' · '),
        changes: [],
      },
      null,
    );
    if (employee.terminationDate) {
      push(
        {
          id: `terminated-${employee.id}`,
          at: dayInstant(employee.terminationDate),
          dateOnly: true,
          kind: 'terminated',
          title: 'Desligamento',
          description: 'Último dia de trabalho.',
          changes: [],
        },
        null,
      );
    }

    const logs = await this.db.client.auditLog.findMany({
      where: { resourceType: 'employee', resourceId: employeeId },
      orderBy: { occurredAt: 'desc' },
      take: 500,
      select: { id: true, occurredAt: true, actorUserId: true, action: true, metadata: true },
    });
    let hasCreation = false;
    for (const log of logs) {
      const meta = asSnapshot(log.metadata);
      const base = { id: log.id, at: log.occurredAt.toISOString(), dateOnly: false };
      switch (log.action) {
        case 'employee.created':
          hasCreation = true;
          push(
            {
              ...base,
              kind: 'record_created',
              title: 'Cadastro criado',
              description: null,
              changes: [],
            },
            log.actorUserId,
          );
          break;
        case 'employee.updated': {
          const changes = employeeChanges(asSnapshot(meta.before), asSnapshot(meta.after));
          push(
            {
              ...base,
              kind: 'record_updated',
              title: 'Cadastro alterado',
              description: changes.length === 0 ? 'Salvo sem mudanças.' : null,
              changes,
            },
            log.actorUserId,
          );
          break;
        }
        case 'employee.account_created':
          push(
            {
              ...base,
              kind: 'account_created',
              title: 'Conta de acesso criada',
              description: text(meta.email) ? `Login: ${String(meta.email)}` : null,
              changes: [],
            },
            log.actorUserId,
          );
          break;
        case 'employee.schedule_assigned':
        case 'employee.schedule_unassigned': {
          const assigned = log.action === 'employee.schedule_assigned';
          push(
            {
              ...base,
              kind: assigned ? 'schedule_assigned' : 'schedule_unassigned',
              title: assigned ? 'Escala vinculada' : 'Vínculo de escala removido',
              description: [
                text(meta.scheduleName),
                brDate(meta.startDate) ? `a partir de ${String(brDate(meta.startDate))}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
              changes: [],
            },
            log.actorUserId,
          );
          break;
        }
        case 'employee.benefit_assigned':
        case 'employee.benefit_updated':
        case 'employee.benefit_removed': {
          const benefit = asSnapshot(meta.benefit);
          const titles = {
            'employee.benefit_assigned': ['benefit_assigned', 'Benefício atribuído'],
            'employee.benefit_updated': ['benefit_updated', 'Benefício alterado'],
            'employee.benefit_removed': ['benefit_removed', 'Benefício excluído'],
          } as const;
          const [kind, title] = titles[log.action];
          const period = [
            brDate(meta.startDate) ? `desde ${String(brDate(meta.startDate))}` : null,
            brDate(meta.endDate) ? `até ${String(brDate(meta.endDate))}` : null,
          ];
          const values = canSeeBenefitValues
            ? `empresa ${money(meta.companyValue)}, desconto ${money(meta.employeeDiscount)}`
            : null;
          push(
            {
              ...base,
              kind,
              title,
              description: [text(benefit.name), ...period, values].filter(Boolean).join(' · '),
              changes: [],
            },
            log.actorUserId,
          );
          break;
        }
        default:
          break;
      }
    }

    // Cadastros importados por planilha ou pelo seed não têm o evento de criação.
    if (!hasCreation) {
      const row = await this.db.client.employee.findUniqueOrThrow({
        where: { id: employeeId },
        select: { createdAt: true },
      });
      push(
        {
          id: `record-${employeeId}`,
          at: row.createdAt.toISOString(),
          dateOnly: false,
          kind: 'record_created',
          title: 'Cadastro criado',
          description: 'Por importação de planilha ou carga inicial.',
          changes: [],
        },
        null,
      );
    }

    if (can('medical_certificates:read')) {
      const certificates = await this.db.client.medicalCertificate.findMany({
        where: { employeeId },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          status: true,
          submittedBy: true,
          reviewedBy: true,
          reviewedAt: true,
          reviewNote: true,
          createdAt: true,
        },
      });
      for (const c of certificates) {
        const period =
          c.startDate.getTime() === c.endDate.getTime()
            ? brDate(fromCalendarDate(c.startDate))
            : `${String(brDate(fromCalendarDate(c.startDate)))} a ${String(brDate(fromCalendarDate(c.endDate)))}`;
        push(
          {
            id: `certificate-${c.id}`,
            at: c.createdAt.toISOString(),
            dateOnly: false,
            kind: 'certificate_submitted',
            title: 'Atestado enviado',
            description: period,
            changes: [],
          },
          c.submittedBy,
        );
        if (c.reviewedAt) {
          push(
            {
              id: `certificate-review-${c.id}`,
              at: c.reviewedAt.toISOString(),
              dateOnly: false,
              kind: 'certificate_reviewed',
              title: `Atestado marcado como ${CERTIFICATE_STATUS[c.status] ?? c.status}`,
              description: [period, c.reviewNote].filter(Boolean).join(' · '),
              changes: [],
            },
            c.reviewedBy,
          );
        }
      }
    }

    if (can('time_entries:read') || can('time_adjustments:approve')) {
      const adjustments = await this.db.client.timeAdjustmentRequest.findMany({
        where: { employeeId },
        select: {
          id: true,
          type: true,
          status: true,
          reason: true,
          requestedBy: true,
          createdAt: true,
          decidedBy: true,
          decidedAt: true,
          decisionNote: true,
        },
      });
      for (const a of adjustments) {
        const what = a.type === 'include' ? 'inclusão de marcação' : 'desconsiderar marcação';
        push(
          {
            id: `adjustment-${a.id}`,
            at: a.createdAt.toISOString(),
            dateOnly: false,
            kind: 'adjustment_requested',
            title: 'Ajuste de ponto pedido',
            description: `${what}: ${a.reason}`,
            changes: [],
          },
          a.requestedBy,
        );
        if (a.decidedAt) {
          push(
            {
              id: `adjustment-decision-${a.id}`,
              at: a.decidedAt.toISOString(),
              dateOnly: false,
              kind: 'adjustment_decided',
              title: `Ajuste de ponto ${ADJUSTMENT_STATUS[a.status] ?? a.status}`,
              description: [what, a.decisionNote].filter(Boolean).join(' · '),
              changes: [],
            },
            a.decidedBy ?? (a.status === 'cancelled' ? a.requestedBy : null),
          );
        }
      }
    }

    const users = actorIds.size
      ? await this.db.client.user.findMany({
          where: { id: { in: [...actorIds] } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    for (const { event, actorId } of pending) {
      const name = actorId ? names.get(actorId) : undefined;
      events.push({ ...event, actor: actorId && name ? { id: actorId, name } : null });
    }
    // Mais recente primeiro.
    return events.sort((a, b) => b.at.localeCompare(a.at));
  }
}
