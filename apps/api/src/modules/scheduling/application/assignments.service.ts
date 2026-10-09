import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  type PlannedDay,
  ProblemType,
  type ScheduleAssignment,
  type scheduleAssignmentInputSchema,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { CompanyService } from '../../organization/application/company.service';
import { invalidReference } from '../../organization/application/catalog-rules';
import { EmployeesService } from '../../workforce/application/employees.service';
import { fromCalendarDate, toCalendarDate, todayIn } from '../../workforce/domain/calendar';
import { addDays, planDays, type PlannerSchedule } from '../domain/planner';

type AssignmentInput = z.output<typeof scheduleAssignmentInputSchema>;

function conflict(detail: string): ProblemException {
  return new ProblemException({
    type: ProblemType.AssignmentOverlap,
    title: 'Conflict',
    status: HttpStatus.CONFLICT,
    detail,
  });
}

function toAssignment(row: {
  id: string;
  scheduleId: string;
  startDate: Date;
  endDate: Date | null;
  cycleStartDate: Date;
  schedule: { name: string };
}): ScheduleAssignment {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    scheduleName: row.schedule.name,
    startDate: fromCalendarDate(row.startDate),
    endDate: fromCalendarDate(row.endDate),
    cycleStartDate: fromCalendarDate(row.cycleStartDate),
  };
}

const ASSIGNMENT_SELECT = {
  id: true,
  scheduleId: true,
  startDate: true,
  endDate: true,
  cycleStartDate: true,
  schedule: { select: { name: true } },
} as const;

/**
 * Vínculo do funcionário às escalas, com histórico. Um novo vínculo encerra o anterior na
 * véspera; vínculos já em vigor são histórico (o ponto é calculado sobre eles) e não se
 * apagam. O acesso ao funcionário respeita o escopo da permissão da rota.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly employees: EmployeesService,
    private readonly company: CompanyService,
    private readonly audit: AuditService,
  ) {}

  async list(employeeId: string, grant: AccessGrant): Promise<ScheduleAssignment[]> {
    await this.employees.get(employeeId, grant);
    const rows = await this.db.client.employeeScheduleAssignment.findMany({
      where: { employeeId },
      select: ASSIGNMENT_SELECT,
      orderBy: { startDate: 'desc' },
    });
    return rows.map(toAssignment);
  }

  async assign(
    employeeId: string,
    input: AssignmentInput,
    grant: AccessGrant,
  ): Promise<ScheduleAssignment> {
    const employee = await this.employees.get(employeeId, grant);
    if (input.startDate < employee.hireDate) {
      throw invalidReference('startDate', 'O vínculo não pode começar antes da admissão.');
    }
    const schedule = await this.db.client.workSchedule.findUnique({
      where: { id: input.scheduleId },
      select: { isActive: true },
    });
    if (!schedule?.isActive)
      throw invalidReference('scheduleId', 'Escala não encontrada ou inativa.');

    const startDate = toCalendarDate(input.startDate);
    const later = await this.db.client.employeeScheduleAssignment.findFirst({
      where: { employeeId, startDate: { gte: startDate } },
      select: { startDate: true },
    });
    if (later) {
      throw conflict(
        `Já existe vínculo começando em ${fromCalendarDate(later.startDate)}. Remova-o antes de criar outro.`,
      );
    }

    return this.db.client.$transaction(async (tx) => {
      // Encerra o vínculo vigente na véspera do novo.
      await tx.employeeScheduleAssignment.updateMany({
        where: { employeeId, OR: [{ endDate: null }, { endDate: { gte: startDate } }] },
        data: { endDate: toCalendarDate(addDays(input.startDate, -1)) },
      });
      const row = await tx.employeeScheduleAssignment.create({
        data: {
          companyId: grant.companyId,
          employeeId,
          scheduleId: input.scheduleId,
          startDate,
          cycleStartDate: toCalendarDate(input.cycleStartDate ?? input.startDate),
          createdBy: grant.userId,
        },
        select: ASSIGNMENT_SELECT,
      });
      const assignment = toAssignment(row);
      await this.audit.record(
        {
          action: 'employee.schedule_assigned',
          resourceType: 'employee',
          resourceId: employeeId,
          metadata: { ...assignment },
        },
        tx,
      );
      return assignment;
    });
  }

  /** Remove um vínculo que ainda não começou e reabre o anterior. */
  async remove(employeeId: string, assignmentId: string, grant: AccessGrant): Promise<void> {
    await this.employees.get(employeeId, grant);
    const row = await this.db.client.employeeScheduleAssignment.findFirst({
      where: { id: assignmentId, employeeId },
      select: ASSIGNMENT_SELECT,
    });
    if (!row) throw new NotFoundException('Vínculo não encontrado.');
    const assignment = toAssignment(row);
    const today = todayIn(await this.company.timezone());
    if (assignment.startDate <= today) {
      throw conflict('Vínculo já em vigor faz parte do histórico e não pode ser removido.');
    }

    await this.db.client.$transaction(async (tx) => {
      await tx.employeeScheduleAssignment.delete({ where: { id: assignmentId } });
      await tx.employeeScheduleAssignment.updateMany({
        where: { employeeId, endDate: toCalendarDate(addDays(assignment.startDate, -1)) },
        data: { endDate: null },
      });
      await this.audit.record(
        {
          action: 'employee.schedule_unassigned',
          resourceType: 'employee',
          resourceId: employeeId,
          metadata: { ...assignment },
        },
        tx,
      );
    });
  }

  async planned(
    employeeId: string,
    from: string,
    to: string,
    grant: AccessGrant,
  ): Promise<PlannedDay[]> {
    await this.employees.get(employeeId, grant);
    return this.plan(employeeId, from, to);
  }

  /** Escala prevista do próprio usuário. */
  async mine(userId: string, from: string, to: string): Promise<PlannedDay[]> {
    const employee = await this.employees.mine(userId);
    return this.plan(employee.id, from, to);
  }

  private async plan(employeeId: string, from: string, to: string): Promise<PlannedDay[]> {
    return (await this.planMany([employeeId], from, to)).get(employeeId) ?? [];
  }

  /**
   * Escala prevista de vários funcionários de uma vez (quadro do dia da gestão). Sem
   * checagem de escopo: quem chama já filtrou os funcionários pelo escopo da permissão.
   */
  async planMany(
    employeeIds: readonly string[],
    from: string,
    to: string,
  ): Promise<Map<string, PlannedDay[]>> {
    const result = new Map<string, PlannedDay[]>();
    if (employeeIds.length === 0) return result;
    const client = this.db.client;
    const [employees, assignments, holidays] = await Promise.all([
      client.employee.findMany({
        where: { id: { in: [...employeeIds] } },
        select: { id: true, unit: { select: { id: true, state: true, city: true } } },
      }),
      client.employeeScheduleAssignment.findMany({
        where: {
          employeeId: { in: [...employeeIds] },
          startDate: { lte: toCalendarDate(to) },
          OR: [{ endDate: null }, { endDate: { gte: toCalendarDate(from) } }],
        },
        select: {
          employeeId: true,
          scheduleId: true,
          startDate: true,
          endDate: true,
          cycleStartDate: true,
        },
      }),
      client.holiday.findMany({
        where: { date: { gte: toCalendarDate(from), lte: toCalendarDate(to) } },
        select: {
          id: true,
          date: true,
          name: true,
          scope: true,
          state: true,
          city: true,
          unitId: true,
        },
      }),
    ]);
    const schedules = await client.workSchedule.findMany({
      where: { id: { in: [...new Set(assignments.map((a) => a.scheduleId))] } },
      select: {
        id: true,
        kind: true,
        cycleAnchor: true,
        weeklyMinutes: true,
        days: {
          orderBy: { dayIndex: 'asc' },
          select: {
            shift: {
              select: {
                id: true,
                name: true,
                startMinute: true,
                endMinute: true,
                breakMinutes: true,
              },
            },
          },
        },
      },
    });

    const scheduleMap = new Map<string, PlannerSchedule>(
      schedules.map((s) => [s.id, { ...s, days: s.days.map((d) => d.shift) }]),
    );
    const plannerHolidays = holidays.map((h) => ({ ...h, date: fromCalendarDate(h.date) }));
    for (const employee of employees) {
      result.set(
        employee.id,
        planDays({
          from,
          to,
          assignments: assignments
            .filter((a) => a.employeeId === employee.id)
            .map((a) => ({
              scheduleId: a.scheduleId,
              startDate: fromCalendarDate(a.startDate),
              endDate: fromCalendarDate(a.endDate),
              cycleStartDate: fromCalendarDate(a.cycleStartDate),
            })),
          schedules: scheduleMap,
          holidays: plannerHolidays,
          unit: employee.unit,
        }),
      );
    }
    return result;
  }
}
