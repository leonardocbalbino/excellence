import { z } from 'zod';
import { calendarDateSchema, cpfSchema, optionalText, pisSchema } from '../br/fields.js';
import { emailSchema } from '../auth/auth.schemas.js';

export const employeeStatusSchema = z.enum(['active', 'terminated']);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

export const employeeSchema = z.object({
  id: z.uuid(),
  registrationNumber: z.string(),
  name: z.string(),
  /** Nome social, quando informado; deve ser o nome exibido. */
  socialName: z.string().nullable(),
  cpf: z.string(),
  pis: z.string().nullable(),
  birthDate: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  hireDate: z.string(),
  terminationDate: z.string().nullable(),
  status: employeeStatusSchema,
  unit: z.object({ id: z.uuid(), name: z.string() }),
  department: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  position: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  union: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  manager: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Conta de acesso ligada ao funcionário. */
  userId: z.uuid().nullable(),
});
export type Employee = z.infer<typeof employeeSchema>;

export const employeeInputSchema = z
  .object({
    registrationNumber: z.string().trim().min(1).max(30),
    name: z.string().trim().min(3).max(200),
    socialName: optionalText(200),
    cpf: cpfSchema,
    pis: pisSchema.nullish().transform((v) => v ?? null),
    birthDate: calendarDateSchema.nullish().transform((v) => v ?? null),
    email: emailSchema.nullish().transform((v) => v ?? null),
    phone: optionalText(30),
    hireDate: calendarDateSchema,
    terminationDate: calendarDateSchema.nullish().transform((v) => v ?? null),
    unitId: z.uuid(),
    departmentId: z.uuid().nullable(),
    positionId: z.uuid().nullable(),
    unionId: z.uuid().nullable(),
    managerId: z.uuid().nullable(),
  })
  .superRefine((employee, ctx) => {
    if (employee.terminationDate && employee.terminationDate < employee.hireDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['terminationDate'],
        message: 'O desligamento não pode ser antes da admissão',
      });
    }
    if (employee.birthDate && employee.birthDate >= employee.hireDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'A data de nascimento deve ser anterior à admissão',
      });
    }
  });
export type EmployeeInput = z.input<typeof employeeInputSchema>;

export const employeeListQuerySchema = z.object({
  /** Busca por nome, nome social, matrícula ou CPF. */
  search: z.string().trim().max(100).optional(),
  unitId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  status: z.enum(['active', 'terminated', 'all']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type EmployeeListQuery = z.input<typeof employeeListQuerySchema>;

export const employeePageSchema = z.object({
  items: z.array(employeeSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type EmployeePage = z.infer<typeof employeePageSchema>;

export const createAccountInputSchema = z.object({ email: emailSchema });
export type CreateAccountInput = z.input<typeof createAccountInputSchema>;

export const createdAccountSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
  /** Exibida uma única vez; o funcionário troca no primeiro acesso. */
  temporaryPassword: z.string(),
});
export type CreatedAccount = z.infer<typeof createdAccountSchema>;

// ─── Importação por planilha ──────────────────────────────────────────────────────

/**
 * Colunas da planilha de importação (CSV com ";" ou "," ou XLSX). Unidade, departamento,
 * cargo e sindicato aceitam o código ou o nome cadastrado; o gestor é a matrícula.
 */
export const EMPLOYEE_IMPORT_COLUMNS = [
  'matricula',
  'nome',
  'nome_social',
  'cpf',
  'pis',
  'data_nascimento',
  'email',
  'telefone',
  'data_admissao',
  'unidade',
  'departamento',
  'cargo',
  'sindicato',
  'matricula_gestor',
] as const;

export const EMPLOYEE_IMPORT_MAX_ROWS = 5000;

export const employeeImportRequestSchema = z.object({
  fileId: z.uuid(),
  /** true: só valida e devolve o relatório, sem gravar. */
  dryRun: z.boolean().default(true),
});
export type EmployeeImportRequest = z.input<typeof employeeImportRequestSchema>;

export const employeeImportReportSchema = z.object({
  totalRows: z.number().int(),
  validRows: z.number().int(),
  /** Linha na planilha (a primeira linha de dados é a 2) e o problema encontrado. */
  errors: z.array(
    z.object({ row: z.number().int(), column: z.string().nullable(), message: z.string() }),
  ),
  /** Quantos foram gravados (0 em simulação ou quando há erros). */
  imported: z.number().int(),
  dryRun: z.boolean(),
});
export type EmployeeImportReport = z.infer<typeof employeeImportReportSchema>;

// ─── Senha ────────────────────────────────────────────────────────────────────────

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  // O tamanho mínimo efetivo é parâmetro da API (PASSWORD_MIN_LENGTH; pendência P-002).
  newPassword: z.string().min(8, 'Use pelo menos 8 caracteres').max(256),
});
export type ChangePasswordInput = z.input<typeof changePasswordInputSchema>;

// ─── Histórico do funcionário ─────────────────────────────────────────────────────

export const employeeHistoryKindSchema = z.enum([
  'hired',
  'terminated',
  'record_created',
  'record_updated',
  'account_created',
  'schedule_assigned',
  'schedule_unassigned',
  'benefit_assigned',
  'benefit_updated',
  'benefit_removed',
  'certificate_submitted',
  'certificate_reviewed',
  'adjustment_requested',
  'adjustment_decided',
]);
export type EmployeeHistoryKind = z.infer<typeof employeeHistoryKindSchema>;

/**
 * Um acontecimento na linha do tempo do funcionário: cadastro e alterações (campo a campo),
 * conta de acesso, escalas, benefícios, atestados e ajustes de ponto. Cada tipo só aparece
 * para quem tem a permissão do módulo.
 */
export const employeeHistoryEventSchema = z.object({
  id: z.string(),
  at: z.iso.datetime({ offset: true }),
  /** Evento de data (admissão, desligamento): sem horário. */
  dateOnly: z.boolean(),
  kind: employeeHistoryKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  changes: z.array(
    z.object({ label: z.string(), before: z.string().nullable(), after: z.string().nullable() }),
  ),
});
export type EmployeeHistoryEvent = z.infer<typeof employeeHistoryEventSchema>;
