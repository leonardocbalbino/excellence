import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RequestContext } from '../../../common/context/request-context';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';
import { EMPTY_SCOPE } from '../../access-control/domain/data-scope';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { slotsOn } from '../../patrols/domain/schedule';
import { addDays } from '../../scheduling/domain/planner';
import { TimeTrackingService } from '../../time-tracking/application/time-tracking.service';
import { toZoned } from '../../time-tracking/domain/zoned-time';
import { todayIn } from '../../workforce/domain/calendar';
import { clockReminder, patrolReminder } from '../domain/reminders';
import { PushSender } from './push-sender';

/** Usuário do contexto nas tarefas automáticas (a auditoria grava ator nulo). */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const CHECK_INTERVAL_MS = 60_000;
/** A chave de "já avisado" vive dois dias: cobre o turno que vira a noite. */
const SENT_TTL_SECONDS = 2 * 24 * 60 * 60;

/**
 * Lembretes de ronda e de ponto (ADR 0022). A cada minuto, nas empresas com aparelhos
 * registrados, confere os horários de ronda e os turnos de hoje (e de ontem, para o turno
 * que termina de madrugada) e avisa quem tem push. Cada lembrete sai uma vez só: a chave fica
 * no Redis. Sem Redis, não envia (melhor faltar um lembrete do que repetir a cada minuto).
 */
@Injectable()
export class PushReminders implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PushReminders.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
    private readonly timeTracking: TimeTrackingService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.push.enabled) return;
    this.timer = setInterval(() => void this.run(), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const companies = await this.prisma.pushDevice.findMany({
        distinct: ['companyId'],
        select: { companyId: true, company: { select: { timezone: true } } },
      });
      for (const { companyId, company } of companies) {
        try {
          const users = new Set(
            (
              await this.prisma.pushDevice.findMany({
                where: { companyId },
                select: { userId: true },
              })
            ).map((d) => d.userId),
          );
          await this.patrols(companyId, company.timezone, users, now);
          await RequestContext.run({ companyId, userId: SYSTEM_USER_ID }, () =>
            this.clock(companyId, company.timezone, users, now),
          );
        } catch (error) {
          this.logger.warn({ err: error, companyId }, 'Falha nos lembretes da empresa');
        }
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'Falha nos lembretes de push');
    } finally {
      this.running = false;
    }
  }

  private async patrols(companyId: string, companyTz: string, users: Set<string>, now: Date) {
    const routes = await this.prisma.patrolRoute.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        expectedMinutes: true,
        startMinutes: true,
        weekdays: true,
        unit: { select: { timezone: true } },
        assignees: { select: { employee: { select: { userId: true, terminationDate: true } } } },
      },
    });
    for (const route of routes) {
      const recipients = route.assignees.flatMap(({ employee }) =>
        employee.userId && users.has(employee.userId) && !employee.terminationDate
          ? [employee.userId]
          : [],
      );
      if (recipients.length === 0) continue;
      const timezone = route.unit.timezone ?? companyTz;
      const today = todayIn(timezone, now);
      const slots = [
        ...slotsOn(route, addDays(today, -1), timezone),
        ...slotsOn(route, today, timezone),
      ];
      if (slots.length === 0) continue;
      const started = new Set(
        (
          await this.prisma.patrolRun.findMany({
            where: { companyId, routeId: route.id, scheduledFor: { in: slots } },
            select: { scheduledFor: true },
          })
        ).map((r) => r.scheduledFor?.getTime()),
      );
      for (const slot of slots) {
        const kind = patrolReminder(slot, started.has(slot.getTime()), now);
        if (!kind) continue;
        if (!(await this.once(`push:${kind}:${route.id}:${slot.toISOString()}`))) continue;
        const time = toZoned(slot, timezone).time;
        await this.push.send(companyId, recipients, {
          title: kind === 'patrol_upcoming' ? `Ronda às ${time}` : 'Ronda atrasada',
          body:
            kind === 'patrol_upcoming'
              ? `${route.name} começa em breve. Abra o app para ler os QR codes.`
              : `A ronda das ${time} (${route.name}) ainda não foi iniciada.`,
          data: { kind, url: '/rondas' },
        });
      }
    }
  }

  private async clock(companyId: string, companyTz: string, users: Set<string>, now: Date) {
    const grant = systemGrant(companyId);
    const today = todayIn(companyTz, now);
    for (const date of [addDays(today, -1), today]) {
      const board = await this.timeTracking.daily(date, undefined, grant);
      const ids = board.items.map((item) => item.employee.id);
      if (ids.length === 0) continue;
      const owners = new Map(
        (
          await this.prisma.employee.findMany({
            where: { companyId, id: { in: ids }, userId: { not: null } },
            select: { id: true, userId: true },
          })
        ).flatMap((e) => (e.userId ? [[e.id, e.userId] as const] : [])),
      );
      for (const item of board.items) {
        const userId = owners.get(item.employee.id);
        if (!userId || !users.has(userId)) continue;
        const reminder = clockReminder(
          item.planned,
          item.entries.length,
          item.status === 'justified',
          item.timezone,
          now,
        );
        if (!reminder) continue;
        if (!(await this.once(`push:${reminder.kind}:${item.employee.id}:${date}`))) continue;
        await this.push.send(companyId, [userId], {
          title:
            reminder.kind === 'clock_in_reminder'
              ? `Seu turno começa às ${reminder.time}`
              : `Seu turno terminou às ${reminder.time}`,
          body:
            reminder.kind === 'clock_in_reminder'
              ? 'Não esqueça de registrar a entrada no ponto.'
              : 'Falta registrar a saída no ponto.',
          data: { kind: reminder.kind, url: '/ponto' },
        });
      }
    }
  }

  /** true na primeira vez que a chave aparece; false se já avisou (ou sem Redis). */
  private async once(key: string): Promise<boolean> {
    try {
      return (await this.redis.set(key, '1', 'EX', SENT_TTL_SECONDS, 'NX')) === 'OK';
    } catch (error) {
      this.logger.warn({ err: error }, 'Redis indisponível: lembrete não enviado');
      return false;
    }
  }
}

function systemGrant(companyId: string): AccessGrant {
  return {
    userId: SYSTEM_USER_ID,
    companyId,
    permission: 'time_entries:read',
    scope: { ...EMPTY_SCOPE, companyWide: true },
  };
}
