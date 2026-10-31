/**
 * Leva um posto do staging para produção: configuração do posto (escalas, turnos, valores por
 * plantão, feriados, pontos e rotas de ronda), o cadastro de benefícios da empresa e os
 * funcionários informados, com VA/VT atribuído. A empresa de produção (a "Teste" do bootstrap)
 * passa a ter o nome, a razão social e o CNPJ da empresa do staging.
 *
 * Idempotente: o que já existe em produção (mesmo nome, mesmo CPF) é mantido, não duplicado.
 * Sem TRANSFER_APPLY=true roda em simulação: faz tudo numa transação e desfaz no fim,
 * imprimindo o que faria. Rode pelo workflow "Transferir posto" (ver deploy/README.md).
 *
 * Variáveis:
 *   SOURCE_DATABASE_URL  banco do staging (só leitura)
 *   DATABASE_URL         banco de produção
 *   TRANSFER_UNIT        nome do posto no staging (ex.: RESERVA LAGOA)
 *   TRANSFER_EMPLOYEES   "NOME:CPF; NOME:CPF; ..." (CPF com ou sem pontuação)
 *   TRANSFER_HIRE_DATE   data do vínculo, AAAA-MM-DD
 *   TRANSFER_APPLY       "true" grava; qualquer outra coisa só simula
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { type Prisma, PrismaClient } from '../src/generated/prisma/client';

/** CNPJ fictício da empresa criada pelo bootstrap (scripts/bootstrap.ts). */
const BOOTSTRAP_CNPJ = '11444777000161';
const VA_VT_KINDS = new Set(['meal', 'food', 'transport']);

class DryRun extends Error {}

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Defina ${key}.`);
  return value;
}

function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    return ((sum * 10) % 11) % 10;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function parseEmployees(raw: string): { name: string; cpf: string }[] {
  const list = raw
    .split(/[;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separator = item.lastIndexOf(':');
      if (separator < 0) throw new Error(`Funcionário sem CPF: "${item}" (use NOME:CPF).`);
      const name = item.slice(0, separator).trim().replace(/\s+/g, ' ').toUpperCase();
      const cpf = item.slice(separator + 1).replace(/\D/g, '');
      if (!name) throw new Error(`Funcionário sem nome: "${item}".`);
      if (!isValidCpf(cpf)) throw new Error(`CPF inválido para ${name}: ${cpf}.`);
      return { name, cpf };
    });
  const cpfs = new Set(list.map((item) => item.cpf));
  if (cpfs.size !== list.length) throw new Error('CPF repetido na lista.');
  return list;
}

function utcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Data inválida: ${value} (AAAA-MM-DD).`);
  return new Date(`${value}T00:00:00.000Z`);
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const apply = process.env.TRANSFER_APPLY === 'true';
  const unitName = required('TRANSFER_UNIT');
  const employees = parseEmployees(required('TRANSFER_EMPLOYEES'));
  const hireDate = utcDate(required('TRANSFER_HIRE_DATE'));

  const source = new PrismaClient({
    adapter: new PrismaPg({ connectionString: required('SOURCE_DATABASE_URL') }),
  });
  const target = new PrismaClient({
    adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
  });
  try {
    // ---- Leitura do staging ----
    const units = await source.unit.findMany({
      where: { name: { equals: unitName, mode: 'insensitive' } },
    });
    const [unit] = units;
    if (!unit || units.length !== 1) {
      throw new Error(`Esperava 1 posto "${unitName}" no staging; achei ${units.length}.`);
    }
    const sourceCompany = await source.company.findUniqueOrThrow({ where: { id: unit.companyId } });
    const S = sourceCompany.id;
    const clock = await source.clockSettings.findUnique({ where: { companyId: S } });

    const matched = await source.employee.findMany({
      where: { companyId: S, cpf: { in: employees.map((e) => e.cpf) } },
      include: {
        scheduleAssignments: true,
        benefits: true,
        patrolRoutes: true,
        position: true,
      },
    });
    const matchedByCpf = new Map(matched.map((e) => [e.cpf, e]));
    const activeAt = (row: { endDate: Date | null }) =>
      row.endDate === null || row.endDate >= hireDate;

    const rates = await source.scheduleRate.findMany({ where: { unitId: unit.id } });
    const scheduleIds = new Set<string>([
      ...rates.map((r) => r.scheduleId),
      ...matched.flatMap((e) => e.scheduleAssignments.filter(activeAt).map((a) => a.scheduleId)),
    ]);
    const schedules = await source.workSchedule.findMany({
      where: { companyId: S, OR: [{ unitId: unit.id }, { id: { in: [...scheduleIds] } }] },
      include: { days: { orderBy: { dayIndex: 'asc' } } },
    });
    const shiftIds = new Set(
      schedules.flatMap((s) => s.days.flatMap((d) => (d.shiftId ? [d.shiftId] : []))),
    );
    const shifts = await source.shift.findMany({
      where: { companyId: S, OR: [{ unitId: unit.id }, { id: { in: [...shiftIds] } }] },
    });
    const departments = await source.department.findMany({ where: { unitId: unit.id } });
    const holidays = await source.holiday.findMany({
      where: { companyId: S, OR: [{ unitId: null }, { unitId: unit.id }] },
    });
    const points = await source.patrolPoint.findMany({ where: { unitId: unit.id } });
    const routes = await source.patrolRoute.findMany({
      where: { unitId: unit.id },
      include: { points: { orderBy: { position: 'asc' } } },
    });
    const benefits = await source.benefit.findMany({ where: { companyId: S } });

    log(`Staging: empresa ${sourceCompany.name} (CNPJ ${sourceCompany.cnpj ?? '-'})`);
    log(
      `Posto ${unit.name}: ${schedules.length} escala(s), ${shifts.length} turno(s), ${rates.length} valor(es) por plantão,`,
    );
    log(
      `  ${departments.length} setor(es), ${holidays.length} feriado(s), ${points.length} ponto(s) e ${routes.length} rota(s) de ronda,`,
    );
    log(`  ${benefits.length} benefício(s) no cadastro da empresa.`);
    log(
      `Funcionários da lista já cadastrados no staging: ${matched.length} de ${employees.length}.`,
    );

    // ---- Escrita em produção (uma transação; na simulação, desfeita no fim) ----
    await target
      .$transaction(
        async (tx) => {
          const T = await targetCompanyId(tx, sourceCompany.cnpj);
          await tx.company.update({
            where: { id: T },
            data: {
              name: sourceCompany.name,
              legalName: sourceCompany.legalName,
              cnpj: sourceCompany.cnpj,
              timezone: sourceCompany.timezone,
            },
          });
          log(`\nProdução: empresa ${T} agora "${sourceCompany.name}".`);
          if (clock) {
            const { companyId: _c, updatedAt: _u, ...settings } = clock;
            await tx.clockSettings.upsert({
              where: { companyId: T },
              create: { companyId: T, ...settings },
              update: settings,
            });
          }
          const author = await tx.user.findFirst({
            where: { companyId: T, isActive: true },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
          if (!author) throw new Error('Nenhum usuário ativo na empresa de produção.');

          // Posto
          const { id: _id, companyId: _co, createdAt: _ca, updatedAt: _ua, ...unitData } = unit;
          const existingUnit = await tx.unit.findFirst({
            where: { companyId: T, name: { equals: unit.name, mode: 'insensitive' } },
            select: { id: true },
          });
          const U = existingUnit
            ? (await tx.unit.update({ where: { id: existingUnit.id }, data: unitData })).id
            : (await tx.unit.create({ data: { ...unitData, companyId: T } })).id;
          log(`Posto ${unit.name}: ${existingUnit ? 'atualizado' : 'criado'}.`);
          const unitIdFor = (id: string | null) => (id === unit.id ? U : null);

          // Setores
          const departmentIds = new Map<string, string>();
          for (const d of departments) {
            const found = await tx.department.findFirst({
              where: { companyId: T, unitId: U, name: d.name },
              select: { id: true },
            });
            const id =
              found?.id ??
              (
                await tx.department.create({
                  data: {
                    companyId: T,
                    unitId: U,
                    name: d.name,
                    code: d.code,
                    isActive: d.isActive,
                  },
                })
              ).id;
            departmentIds.set(d.id, id);
          }

          // Turnos e escalas
          const shiftMap = new Map<string, string>();
          for (const s of shifts) {
            const unitId = unitIdFor(s.unitId);
            const found = await tx.shift.findFirst({
              where: { companyId: T, unitId, name: s.name },
              select: { id: true },
            });
            const data = {
              code: s.code,
              startMinute: s.startMinute,
              endMinute: s.endMinute,
              breakMinutes: s.breakMinutes,
              isActive: s.isActive,
            };
            const id = found
              ? (await tx.shift.update({ where: { id: found.id }, data })).id
              : (await tx.shift.create({ data: { ...data, companyId: T, unitId, name: s.name } }))
                  .id;
            shiftMap.set(s.id, id);
          }
          const scheduleMap = new Map<string, string>();
          for (const s of schedules) {
            const unitId = unitIdFor(s.unitId);
            const found = await tx.workSchedule.findFirst({
              where: { companyId: T, unitId, name: s.name },
              select: { id: true },
            });
            const data = {
              code: s.code,
              kind: s.kind,
              cycleAnchor: s.cycleAnchor,
              parityMonth: s.parityMonth,
              weeklyMinutes: s.weeklyMinutes,
              notes: s.notes,
              isActive: s.isActive,
            };
            const id = found
              ? (await tx.workSchedule.update({ where: { id: found.id }, data })).id
              : (
                  await tx.workSchedule.create({
                    data: { ...data, companyId: T, unitId, name: s.name },
                  })
                ).id;
            await tx.workScheduleDay.deleteMany({ where: { scheduleId: id } });
            if (s.days.length > 0) {
              await tx.workScheduleDay.createMany({
                data: s.days.map((d) => ({
                  companyId: T,
                  scheduleId: id,
                  dayIndex: d.dayIndex,
                  shiftId: d.shiftId ? (shiftMap.get(d.shiftId) ?? null) : null,
                })),
              });
            }
            scheduleMap.set(s.id, id);
          }
          for (const r of rates) {
            const scheduleId = scheduleMap.get(r.scheduleId);
            if (!scheduleId) continue;
            await tx.scheduleRate.upsert({
              where: {
                unitId_scheduleId_validFrom: { unitId: U, scheduleId, validFrom: r.validFrom },
              },
              create: {
                companyId: T,
                unitId: U,
                scheduleId,
                validFrom: r.validFrom,
                amountCents: r.amountCents,
                createdBy: author.id,
              },
              update: { amountCents: r.amountCents },
            });
          }
          log(
            `Escalas: ${scheduleMap.size}; turnos: ${shiftMap.size}; valores por plantão: ${rates.length}.`,
          );

          // Feriados (da empresa e do posto)
          let newHolidays = 0;
          for (const h of holidays) {
            const unitId = unitIdFor(h.unitId);
            const exists = await tx.holiday.count({
              where: { companyId: T, date: h.date, name: h.name, scope: h.scope, unitId },
            });
            if (exists > 0) continue;
            await tx.holiday.create({
              data: {
                companyId: T,
                date: h.date,
                name: h.name,
                scope: h.scope,
                state: h.state,
                city: h.city,
                unitId,
              },
            });
            newHolidays++;
          }
          log(`Feriados novos: ${newHolidays}.`);

          // Ronda: o token do QR é copiado, então os QR codes já impressos continuam valendo.
          const pointMap = new Map<string, string>();
          for (const p of points) {
            const data = {
              description: p.description,
              latitude: p.latitude,
              longitude: p.longitude,
              radiusMeters: p.radiusMeters,
              codeToken: p.codeToken,
              codeVersion: p.codeVersion,
              isActive: p.isActive,
            };
            const row = await tx.patrolPoint.upsert({
              where: { companyId_unitId_name: { companyId: T, unitId: U, name: p.name } },
              create: { ...data, companyId: T, unitId: U, name: p.name },
              update: data,
            });
            pointMap.set(p.id, row.id);
          }
          const routeMap = new Map<string, string>();
          for (const r of routes) {
            const data = {
              description: r.description,
              expectedMinutes: r.expectedMinutes,
              enforceOrder: r.enforceOrder,
              minPoints: r.minPoints,
              startMinutes: r.startMinutes,
              weekdays: r.weekdays,
              isActive: r.isActive,
            };
            const row = await tx.patrolRoute.upsert({
              where: { companyId_unitId_name: { companyId: T, unitId: U, name: r.name } },
              create: { ...data, companyId: T, unitId: U, name: r.name },
              update: data,
            });
            await tx.patrolRoutePoint.deleteMany({ where: { routeId: row.id } });
            const routePoints = r.points.flatMap((rp) => {
              const pointId = pointMap.get(rp.pointId);
              return pointId
                ? [{ companyId: T, routeId: row.id, position: rp.position, pointId }]
                : [];
            });
            if (routePoints.length > 0) await tx.patrolRoutePoint.createMany({ data: routePoints });
            routeMap.set(r.id, row.id);
          }
          log(`Ronda: ${pointMap.size} ponto(s), ${routeMap.size} rota(s).`);

          // Cadastro de benefícios
          const benefitMap = new Map<string, { id: string; source: (typeof benefits)[number] }>();
          for (const b of benefits) {
            const { id: _bid, companyId: _bco, createdAt: _bca, updatedAt: _bua, ...data } = b;
            const row = await tx.benefit.upsert({
              where: { companyId_name: { companyId: T, name: b.name } },
              create: { ...data, companyId: T },
              update: data,
            });
            benefitMap.set(b.id, { id: row.id, source: b });
          }
          log(`Benefícios no cadastro: ${benefitMap.size}.`);

          // Funcionários
          const usedRegistrations = new Set(
            (
              await tx.employee.findMany({
                where: { companyId: T },
                select: { registrationNumber: true },
              })
            ).map((e) => e.registrationNumber.toUpperCase()),
          );
          let sequence = 1;
          const nextRegistration = () => {
            let value: string;
            do value = `RL-${String(sequence++).padStart(3, '0')}`;
            while (usedRegistrations.has(value));
            usedRegistrations.add(value);
            return value;
          };
          const positionIdFor = async (position: { name: string; cbo: string | null } | null) => {
            if (!position) return null;
            const row = await tx.position.upsert({
              where: { companyId_name: { companyId: T, name: position.name } },
              create: { companyId: T, name: position.name, cbo: position.cbo },
              update: {},
            });
            return row.id;
          };

          for (const person of employees) {
            const existing = await tx.employee.findFirst({
              where: { companyId: T, cpf: person.cpf },
              select: { id: true },
            });
            if (existing) {
              log(`- ${person.name}: já existe em produção (mantido).`);
              continue;
            }
            const from = matchedByCpf.get(person.cpf);
            const registration =
              from && !usedRegistrations.has(from.registrationNumber.toUpperCase())
                ? from.registrationNumber
                : nextRegistration();
            usedRegistrations.add(registration.toUpperCase());
            const employee = await tx.employee.create({
              data: {
                companyId: T,
                registrationNumber: registration,
                name: from?.name ?? person.name,
                socialName: from?.socialName ?? null,
                cpf: person.cpf,
                pis: from?.pis ?? null,
                birthDate: from?.birthDate ?? null,
                email: from?.email ?? null,
                phone: from?.phone ?? null,
                hireDate,
                unitId: U,
                departmentId: from?.departmentId
                  ? (departmentIds.get(from.departmentId) ?? null)
                  : null,
                positionId: await positionIdFor(from?.position ?? null),
              },
              select: { id: true },
            });

            const assignment = from?.scheduleAssignments.find(
              (a) => activeAt(a) && scheduleMap.has(a.scheduleId),
            );
            const assignedSchedule = assignment && scheduleMap.get(assignment.scheduleId);
            if (assignment && assignedSchedule) {
              await tx.employeeScheduleAssignment.create({
                data: {
                  companyId: T,
                  employeeId: employee.id,
                  scheduleId: assignedSchedule,
                  startDate: hireDate,
                  // Mantém o ciclo (par/ímpar) que o funcionário já seguia.
                  cycleStartDate: assignment.cycleStartDate,
                  createdBy: author.id,
                },
              });
            }
            const routeIds = (from?.patrolRoutes ?? []).flatMap(
              (a) => routeMap.get(a.routeId) ?? [],
            );
            if (routeIds.length > 0) {
              await tx.patrolRouteAssignee.createMany({
                data: routeIds.map((routeId) => ({
                  companyId: T,
                  routeId,
                  employeeId: employee.id,
                })),
                skipDuplicates: true,
              });
            }

            // VA/VT: o que ele já tinha no staging; sem isso, os valores padrão do benefício.
            const granted: string[] = [];
            for (const [sourceId, benefit] of benefitMap) {
              const previous = from?.benefits.find(
                (eb) => eb.benefitId === sourceId && activeAt(eb),
              );
              const isVaVt = VA_VT_KINDS.has(benefit.source.kind) && benefit.source.isActive;
              if (!previous && !isVaVt) continue;
              const daily = benefit.source.calculation !== 'monthly';
              await tx.employeeBenefit.create({
                data: {
                  companyId: T,
                  employeeId: employee.id,
                  benefitId: benefit.id,
                  companyValueCents: daily
                    ? 0
                    : (previous?.companyValueCents ?? benefit.source.defaultCompanyValueCents ?? 0),
                  dailyValueCents: daily
                    ? (previous?.dailyValueCents ?? benefit.source.defaultDailyValueCents)
                    : null,
                  employeeDiscountCents:
                    previous?.employeeDiscountCents ??
                    benefit.source.defaultEmployeeDiscountCents ??
                    0,
                  startDate: hireDate,
                  notes: previous?.notes ?? null,
                  createdBy: author.id,
                },
              });
              granted.push(benefit.source.name);
            }
            log(
              `- ${person.name} (${registration})${from ? ' · dados do staging' : ''}` +
                (assignment ? ' · escala' : ' · sem escala') +
                ` · benefícios: ${granted.length > 0 ? granted.join(', ') : 'nenhum'}`,
            );
          }

          if (!apply) throw new DryRun();
        },
        { timeout: 600_000, maxWait: 30_000 },
      )
      .catch((error: unknown) => {
        if (error instanceof DryRun) {
          log('\nSIMULAÇÃO: nada foi gravado. Rode de novo com "aplicar" para gravar.');
          return;
        }
        throw error;
      });
    if (apply) log('\nGravado em produção.');
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

/** A empresa de produção: a que já tem o CNPJ do staging (rodada anterior) ou a do bootstrap. */
async function targetCompanyId(
  tx: Prisma.TransactionClient,
  sourceCnpj: string | null,
): Promise<string> {
  for (const cnpj of [sourceCnpj, BOOTSTRAP_CNPJ]) {
    if (!cnpj) continue;
    const company = await tx.company.findUnique({ where: { cnpj }, select: { id: true } });
    if (company) return company.id;
  }
  throw new Error('Empresa de produção não encontrada (nem a do staging nem a do bootstrap).');
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
