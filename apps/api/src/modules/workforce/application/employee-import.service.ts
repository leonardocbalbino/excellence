import { HttpStatus, Injectable } from '@nestjs/common';
import {
  EMPLOYEE_IMPORT_COLUMNS,
  EMPLOYEE_IMPORT_MAX_ROWS,
  type EmployeeImportReport,
  employeeInputSchema,
  ProblemType,
} from '@excellence/shared';
import type { z } from 'zod';
import { ProblemException } from '../../../common/errors/problem.exception';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { FilesService } from '../../files/application/files.service';
import { isInScope } from '../domain/employee-scope';
import {
  padDocument,
  parseSheetDate,
  parseSpreadsheet,
  type SheetRow,
} from '../domain/spreadsheet';
import { EmployeesService, toEmployeeData } from './employees.service';

type EmployeeInput = z.output<typeof employeeInputSchema>;
type ImportError = EmployeeImportReport['errors'][number];

const REQUIRED_COLUMNS = ['matricula', 'nome', 'cpf', 'data_admissao', 'unidade'] as const;

/** Campo do cadastro → coluna da planilha, para apontar o erro no lugar certo. */
const COLUMN_OF: Record<string, string> = {
  registrationNumber: 'matricula',
  name: 'nome',
  socialName: 'nome_social',
  cpf: 'cpf',
  pis: 'pis',
  birthDate: 'data_nascimento',
  email: 'email',
  phone: 'telefone',
  hireDate: 'data_admissao',
  unitId: 'unidade',
  departmentId: 'departamento',
  positionId: 'cargo',
  unionId: 'sindicato',
  managerId: 'matricula_gestor',
};

interface Lookup {
  id: string;
  isActive: boolean;
  unitId?: string | null;
}

/** Índice por código e por nome (sem diferenciar maiúsculas). */
function index(items: (Lookup & { name: string; code?: string | null })[]): Map<string, Lookup> {
  const map = new Map<string, Lookup>();
  for (const item of items) {
    map.set(item.name.toLowerCase(), item);
    if (item.code) map.set(item.code.toLowerCase(), item);
  }
  return map;
}

interface ValidRow {
  row: number;
  input: EmployeeInput;
  /** Gestor já cadastrado no sistema. */
  managerId: string | null;
  /** Gestor que está sendo importado na mesma planilha (matrícula, minúscula). */
  managerInFile: string | null;
}

/**
 * Importação de funcionários por planilha (CSV ou XLSX). Valida tudo antes de gravar e
 * grava tudo ou nada: com qualquer erro, nenhuma linha é importada (ADR 0010).
 */
@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly files: FilesService,
    private readonly employees: EmployeesService,
    private readonly audit: AuditService,
  ) {}

  template(): string {
    const example = [
      '1001',
      'Maria da Silva',
      '',
      '529.982.247-25',
      '',
      '15/03/1990',
      'maria@exemplo.com.br',
      '(11) 99999-0000',
      '01/02/2024',
      'MATRIZ',
      'Operações',
      'Vigilante',
      '',
      '',
    ];
    return `${EMPLOYEE_IMPORT_COLUMNS.join(';')}\n${example.join(';')}\n`;
  }

  async run(fileId: string, dryRun: boolean, grant: AccessGrant): Promise<EmployeeImportReport> {
    const { content, contentType } = await this.files.readOwnUpload(fileId, 'spreadsheet_import');
    let sheet;
    try {
      sheet = await parseSpreadsheet(content, contentType);
    } catch {
      throw badSheet('Não foi possível ler a planilha. Confira o formato (CSV ou XLSX).');
    }
    const missing = REQUIRED_COLUMNS.filter((column) => !sheet.headers.includes(column));
    if (missing.length > 0) throw badSheet(`Colunas obrigatórias ausentes: ${missing.join(', ')}.`);
    if (sheet.rows.length === 0) throw badSheet('A planilha não tem linhas de dados.');
    if (sheet.rows.length > EMPLOYEE_IMPORT_MAX_ROWS) {
      throw badSheet(`A planilha passa do limite de ${EMPLOYEE_IMPORT_MAX_ROWS} linhas.`);
    }

    const { valid, errors } = await this.validate(sheet.rows, grant);
    const report = {
      totalRows: sheet.rows.length,
      validRows: valid.length,
      errors,
      imported: 0,
      dryRun,
    };
    if (dryRun || errors.length > 0) return report;

    const imported = await this.persist(valid, fileId, grant);
    return { ...report, imported };
  }

  private async validate(rows: SheetRow[], grant: AccessGrant) {
    const client = this.db.client;
    const [units, departments, positions, unions, existing] = await Promise.all([
      client.unit.findMany({ select: { id: true, name: true, code: true, isActive: true } }),
      client.department.findMany({
        select: { id: true, name: true, code: true, isActive: true, unitId: true },
      }),
      client.position.findMany({ select: { id: true, name: true, isActive: true } }),
      client.laborUnion.findMany({ select: { id: true, name: true, isActive: true } }),
      client.employee.findMany({ select: { id: true, cpf: true, registrationNumber: true } }),
    ]);
    const maps = {
      unidade: index(units),
      departamento: index(departments),
      cargo: index(positions),
      sindicato: index(unions),
    };
    const existingCpf = new Set(existing.map((e) => e.cpf));
    const existingByRegistration = new Map(
      existing.map((e) => [e.registrationNumber.toLowerCase(), e.id]),
    );
    const fileRegistrations = new Map<string, number>();
    const fileCpfs = new Map<string, number>();
    const actor = await this.employees.actor(grant);
    const scope = grant.scope;

    const errors: ImportError[] = [];
    const valid: ValidRow[] = [];

    for (const { row, values } of rows) {
      const rowErrors: ImportError[] = [];
      const fail = (column: string | null, message: string) =>
        rowErrors.push({ row, column, message });

      const resolve = (column: keyof typeof maps, required: boolean): string | null => {
        const raw = values[column]?.trim() ?? '';
        if (!raw) {
          if (required) fail(column, 'Obrigatório');
          return null;
        }
        const found = maps[column].get(raw.toLowerCase());
        if (!found) fail(column, `"${raw}" não encontrado no cadastro`);
        else if (!found.isActive) fail(column, `"${raw}" está inativo`);
        return found?.id ?? null;
      };

      const unitId = resolve('unidade', true);
      const departmentId = resolve('departamento', false);
      const department = departmentId ? departments.find((d) => d.id === departmentId) : undefined;
      if (department?.unitId && unitId && department.unitId !== unitId) {
        fail('departamento', 'O departamento pertence a outra unidade');
      }

      const date = (column: string) => {
        const raw = values[column] ?? '';
        return raw ? (parseSheetDate(raw) ?? raw) : null;
      };
      const parsed = employeeInputSchema.safeParse({
        registrationNumber: values.matricula ?? '',
        name: values.nome ?? '',
        socialName: values.nome_social ?? null,
        cpf: padDocument(values.cpf ?? '', 11),
        pis: values.pis ? padDocument(values.pis, 11) : null,
        birthDate: date('data_nascimento'),
        // Célula vazia vira null (o schema recusaria e-mail em branco).
        email: values.email?.trim() ? values.email : null,
        phone: values.telefone ?? null,
        hireDate: date('data_admissao') ?? '',
        terminationDate: null,
        unitId: unitId ?? '00000000-0000-0000-0000-000000000000',
        departmentId,
        positionId: resolve('cargo', false),
        unionId: resolve('sindicato', false),
        managerId: null,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? '');
          // Referências não resolvidas já foram apontadas acima.
          if (field === 'unitId' && !unitId) continue;
          fail(COLUMN_OF[field] ?? null, issue.message);
        }
      }

      let managerId: string | null = null;
      let managerInFile: string | null = null;
      const managerRegistration = values.matricula_gestor?.trim().toLowerCase();
      if (managerRegistration) {
        if (managerRegistration === values.matricula?.trim().toLowerCase()) {
          fail('matricula_gestor', 'O funcionário não pode ser gestor de si mesmo');
        } else if (existingByRegistration.has(managerRegistration)) {
          managerId = existingByRegistration.get(managerRegistration) ?? null;
        } else if (
          rows.some((r) => r.values.matricula?.trim().toLowerCase() === managerRegistration)
        ) {
          managerInFile = managerRegistration;
        } else {
          fail('matricula_gestor', 'Gestor não encontrado (nem no cadastro, nem na planilha)');
        }
      }

      if (parsed.success) {
        const input = parsed.data;
        const registration = input.registrationNumber.toLowerCase();
        if (existingByRegistration.has(registration)) fail('matricula', 'Matrícula já cadastrada');
        const repeatedAt = fileRegistrations.get(registration);
        if (repeatedAt) fail('matricula', `Matrícula repetida (linha ${repeatedAt})`);
        else fileRegistrations.set(registration, row);
        if (existingCpf.has(input.cpf)) fail('cpf', 'CPF já cadastrado');
        const cpfAt = fileCpfs.get(input.cpf);
        if (cpfAt) fail('cpf', `CPF repetido (linha ${cpfAt})`);
        else fileCpfs.set(input.cpf, row);

        if (scope && unitId && !isInScope(scope, actor, { ...input, managerId, userId: null })) {
          fail(null, 'Funcionário fora do escopo de dados do seu perfil');
        }
        if (rowErrors.length === 0)
          valid.push({ row, input: { ...input, managerId }, managerId, managerInFile });
      }
      errors.push(...rowErrors);
    }

    errors.push(...findManagementCycles(valid));
    // Linhas válidas = sem nenhum erro (inclusive ciclo de gestão apontado depois).
    const rowsWithErrors = new Set(errors.map((error) => error.row));
    return { valid: valid.filter((row) => !rowsWithErrors.has(row.row)), errors };
  }

  private async persist(rows: ValidRow[], fileId: string, grant: AccessGrant): Promise<number> {
    return this.db.client.$transaction(
      async (tx) => {
        const created = await tx.employee.createManyAndReturn({
          data: rows.map((r) => ({ ...toEmployeeData(r.input), companyId: grant.companyId })),
          select: { id: true, registrationNumber: true },
        });
        const idByRegistration = new Map(
          created.map((c) => [c.registrationNumber.toLowerCase(), c.id]),
        );

        // Gestores importados na mesma planilha: liga depois de todos existirem.
        const byManager = new Map<string, string[]>();
        for (const row of rows) {
          if (!row.managerInFile) continue;
          const managerId = idByRegistration.get(row.managerInFile);
          const employeeId = idByRegistration.get(row.input.registrationNumber.toLowerCase());
          if (managerId && employeeId)
            byManager.set(managerId, [...(byManager.get(managerId) ?? []), employeeId]);
        }
        for (const [managerId, ids] of byManager) {
          await tx.employee.updateMany({ where: { id: { in: ids } }, data: { managerId } });
        }

        await this.audit.record(
          {
            action: 'employees.imported',
            resourceType: 'file',
            resourceId: fileId,
            metadata: { count: created.length },
          },
          tx,
        );
        return created.length;
      },
      { timeout: 60_000 },
    );
  }
}

/** Ciclos de gestão entre linhas da própria planilha (ex.: A gere B e B gere A). */
export function findManagementCycles(rows: ValidRow[]): ImportError[] {
  const managerOf = new Map<string, string>();
  const rowOf = new Map<string, number>();
  for (const row of rows) {
    const registration = row.input.registrationNumber.toLowerCase();
    rowOf.set(registration, row.row);
    if (row.managerInFile) managerOf.set(registration, row.managerInFile);
  }
  const errors: ImportError[] = [];
  for (const start of managerOf.keys()) {
    const seen = new Set<string>([start]);
    let current = managerOf.get(start);
    while (current) {
      if (current === start) {
        errors.push({
          row: rowOf.get(start) ?? 0,
          column: 'matricula_gestor',
          message: 'Ciclo de gestão entre funcionários da planilha',
        });
        break;
      }
      if (seen.has(current)) break;
      seen.add(current);
      current = managerOf.get(current);
    }
  }
  return errors;
}

function badSheet(detail: string): ProblemException {
  return new ProblemException({
    type: ProblemType.Validation,
    title: 'Bad Request',
    status: HttpStatus.BAD_REQUEST,
    detail,
  });
}
