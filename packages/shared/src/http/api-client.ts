import { z } from 'zod';
import {
  type AssignRolesInput,
  assignRolesInputSchema,
  myAccessSchema,
  permissionInfoSchema,
  type RoleInput,
  roleInputSchema,
  roleSchema,
  userWithRolesSchema,
} from '../access-control/roles.schemas.js';
import {
  type AuditLogQuery,
  auditLogPageSchema,
  auditLogQuerySchema,
} from '../audit/audit.schemas.js';
import {
  authenticatedResponseSchema,
  authUserSchema,
  type LoginRequest,
  loginRequestSchema,
  loginResponseSchema,
  mfaActivateResponseSchema,
  type MfaCodeRequest,
  mfaCodeRequestSchema,
  mfaSetupResponseSchema,
  type RefreshRequest,
  refreshRequestSchema,
} from '../auth/auth.schemas.js';
import {
  type ProblemDetails,
  ProblemType,
  problemDetailsSchema,
} from '../errors/problem-details.js';
import {
  downloadLinkSchema,
  storedFileSchema,
  type UploadRequest,
  uploadRequestSchema,
  uploadTicketSchema,
} from '../files/files.schemas.js';
import {
  type CompanyInput,
  companyInputSchema,
  companySchema,
  departmentInputSchema,
  departmentSchema,
  laborUnionInputSchema,
  laborUnionSchema,
  positionInputSchema,
  positionSchema,
  unitInputSchema,
  unitSchema,
} from '../organization/organization.schemas.js';
import {
  type ChangePasswordInput,
  changePasswordInputSchema,
  type CreateAccountInput,
  createAccountInputSchema,
  createdAccountSchema,
  type EmployeeImportRequest,
  employeeImportReportSchema,
  employeeImportRequestSchema,
  type EmployeeInput,
  employeeInputSchema,
  type EmployeeListQuery,
  employeeListQuerySchema,
  employeePageSchema,
  employeeHistoryEventSchema,
  employeeSchema,
} from '../workforce/employees.schemas.js';
import {
  type HolidayInput,
  holidayInputSchema,
  holidaySchema,
  plannedDaySchema,
  type ScheduleAssignmentInput,
  scheduleAssignmentInputSchema,
  scheduleAssignmentSchema,
  shiftInputSchema,
  shiftSchema,
  workScheduleInputSchema,
  workScheduleSchema,
} from '../scheduling/scheduling.schemas.js';
import {
  type AdjustmentDecision,
  adjustmentDecisionSchema,
  type AdjustmentInput,
  adjustmentInputSchema,
  adjustmentSchema,
  type ClockInput,
  clockInputSchema,
  clockReceiptSchema,
  type ClockSettings,
  chainVerificationSchema,
  clockSettingsSchema,
  type DailyAttendanceQuery,
  dailyAttendanceSchema,
  timeEntrySchema,
  timesheetSchema,
} from '../time-tracking/time-tracking.schemas.js';
import {
  myPatrolsSchema,
  type PatrolCheckinInput,
  patrolCheckinInputSchema,
  patrolBoardSchema,
  patrolPointInputSchema,
  patrolPointSchema,
  patrolRouteInputSchema,
  patrolRouteSchema,
  type PatrolRunFinish,
  patrolRunFinishSchema,
  patrolRunSchema,
  patrolRunStartSchema,
} from '../patrols/patrols.schemas.js';
import {
  benefitInputSchema,
  benefitSchema,
  type EmployeeBenefitInput,
  employeeBenefitInputSchema,
  employeeBenefitSchema,
  myBenefitSchema,
  usefulLinkInputSchema,
  usefulLinkSchema,
} from '../benefits/benefits.schemas.js';
import {
  myPayrollPreviewSchema,
  payrollGenerateSchema,
  payrollPeriodDetailSchema,
  payrollPeriodSchema,
} from '../payroll/payroll.schemas.js';
import {
  conversationDetailSchema,
  type ConversationListQuery,
  type ConversationMessageInput,
  conversationMessageInputSchema,
  conversationMessageSchema,
  type ConversationStart,
  conversationStartSchema,
  conversationSummarySchema,
  conversationUnreadSchema,
  type PushDeviceInput,
  pushDeviceInputSchema,
} from '../conversations/conversations.schemas.js';
import {
  type AnnouncementInput,
  announcementInputSchema,
  announcementReceiptSchema,
  announcementSchema,
  type AnnouncementStatus,
  myAnnouncementFeedSchema,
  myAnnouncementSchema,
} from '../announcements/announcements.schemas.js';
import {
  type MedicalCertificateInput,
  medicalCertificateInputSchema,
  type MedicalCertificateListQuery,
  type MedicalCertificateReview,
  medicalCertificateReviewSchema,
  medicalCertificateSchema,
  medicalCertificateSensitiveSchema,
} from '../medical/medical-certificates.schemas.js';

/** Erro HTTP da API, com o Problem Details (RFC 7807) já interpretado. */
export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }

  get type(): string {
    return this.problem.type;
  }

  /** Erros de validação por campo, prontos para exibir no formulário. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem.errors ?? []).map((e) => [e.path, e.message]));
  }
}

/** Falha de rede ou resposta fora do contrato. */
export class ApiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ApiUnavailableError';
  }
}

export interface ApiClientOptions {
  /** Ex.: "/api/v1" (web, mesma origem) ou "https://api.exemplo.com.br/api/v1" (mobile). */
  baseUrl: string;
  /** Access token atual, ou null. */
  getAccessToken: () => string | null;
  /**
   * Renova a sessão quando uma chamada autenticada recebe 401. Devolve true se renovou;
   * a chamada original é repetida uma vez.
   */
  refreshSession?: () => Promise<boolean>;
  fetch?: typeof fetch;
  /** Origem registrada nas marcações de ponto. */
  clientName?: 'web' | 'mobile';
  /** "include" no web, para o cookie httpOnly do refresh token. */
  credentials?: RequestCredentials;
}

interface RequestOptions<T extends z.ZodType | undefined> {
  body?: unknown;
  /** Valida (e transforma) o corpo antes do envio; erro vira Promise rejeitada. */
  bodySchema?: z.ZodType;
  query?: Record<string, string | number | undefined>;
  schema?: T;
  /** Token específico (ex.: token de MFA) no lugar do access token. */
  token?: string;
  /** Headers extras (ex.: Idempotency-Key). */
  headers?: Record<string, string>;
  /** false: não tenta renovar a sessão em 401 (login, refresh, MFA). */
  retryOnUnauthorized?: boolean;
}

type Result<T extends z.ZodType | undefined> = T extends z.ZodType ? z.output<T> : undefined;

/**
 * Client HTTP tipado da API. Entradas são validadas com os mesmos schemas da API e as
 * respostas são conferidas contra o contrato antes de chegar à tela.
 */
export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  /** Envia a requisição (com renovação de sessão em 401) e devolve a resposta já checada. */
  async function execute(
    method: string,
    path: string,
    opts: RequestOptions<z.ZodType | undefined>,
  ): Promise<Response> {
    const body: unknown = opts.bodySchema ? opts.bodySchema.parse(opts.body) : opts.body;
    const url = new URL(`${options.baseUrl}${path}`, 'http://placeholder');
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const relative = options.baseUrl.startsWith('http')
      ? url.toString()
      : `${url.pathname}${url.search}`;

    const send = () => {
      const token = opts.token ?? options.getAccessToken();
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (options.clientName) headers['X-Client'] = options.clientName;
      Object.assign(headers, opts.headers);
      if (token) headers.Authorization = `Bearer ${token}`;
      return doFetch(relative, {
        method,
        headers,
        credentials: options.credentials ?? 'same-origin',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    };

    let response: Response;
    try {
      response = await send();
      if (
        response.status === 401 &&
        opts.retryOnUnauthorized !== false &&
        !opts.token &&
        options.refreshSession &&
        (await isUnauthenticated(response.clone())) &&
        (await options.refreshSession())
      ) {
        response = await send();
      }
    } catch (error) {
      throw new ApiUnavailableError('Não foi possível falar com o servidor.', { cause: error });
    }

    if (!response.ok) throw new ApiError(await readProblem(response));
    return response;
  }

  async function request<T extends z.ZodType | undefined = undefined>(
    method: string,
    path: string,
    opts: RequestOptions<T> = {},
  ): Promise<Result<T>> {
    const response = await execute(method, path, opts);
    if (response.status === 204 || !opts.schema) return undefined as Result<T>;
    const parsed = opts.schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ApiUnavailableError(`Resposta fora do contrato em ${method} ${path}`, {
        cause: parsed.error,
      });
    }
    return parsed.data as Result<T>;
  }

  /** Resposta em texto (ex.: modelo de planilha CSV). */
  async function requestText(method: string, path: string): Promise<string> {
    return (await execute(method, path, {})).text();
  }

  /** Cadastro simples: listar, ler, criar, alterar e excluir. */
  function crud<Out extends z.ZodType, In extends z.ZodType>(
    path: string,
    schema: Out,
    inputSchema: In,
  ) {
    const item = (id: string) => `${path}/${encodeURIComponent(id)}`;
    return {
      list: (includeInactive = false) =>
        request('GET', path, {
          query: { includeInactive: String(includeInactive) },
          schema: z.array(schema),
        }),
      get: (id: string) => request('GET', item(id), { schema }),
      create: (input: z.input<In>) =>
        request('POST', path, { body: input, bodySchema: inputSchema, schema }),
      update: (id: string, input: z.input<In>) =>
        request('PUT', item(id), { body: input, bodySchema: inputSchema, schema }),
      remove: (id: string) => request('DELETE', item(id)),
    };
  }

  const noRetry = { retryOnUnauthorized: false } as const;

  return {
    request,
    requestText,
    company: {
      get: () => request('GET', '/company', { schema: companySchema }),
      update: (input: CompanyInput) =>
        request('PUT', '/company', {
          body: input,
          bodySchema: companyInputSchema,
          schema: companySchema,
        }),
    },
    units: crud('/units', unitSchema, unitInputSchema),
    departments: crud('/departments', departmentSchema, departmentInputSchema),
    positions: crud('/positions', positionSchema, positionInputSchema),
    unions: crud('/unions', laborUnionSchema, laborUnionInputSchema),
    patrolPoints: {
      ...crud('/patrol-points', patrolPointSchema, patrolPointInputSchema),
      /** Gera um novo QR: o impresso antes deixa de valer. */
      regenerateCode: (id: string) =>
        request('POST', `/patrol-points/${encodeURIComponent(id)}/code`, {
          schema: patrolPointSchema,
        }),
    },
    patrolRoutes: crud('/patrol-routes', patrolRouteSchema, patrolRouteInputSchema),
    benefits: {
      ...crud('/benefits', benefitSchema, benefitInputSchema),
      mine: () => request('GET', '/me/benefits', { schema: z.array(myBenefitSchema) }),
      ofEmployee: (employeeId: string) =>
        request('GET', `/employees/${encodeURIComponent(employeeId)}/benefits`, {
          schema: z.array(employeeBenefitSchema),
        }),
      assign: (employeeId: string, input: EmployeeBenefitInput) =>
        request('POST', `/employees/${encodeURIComponent(employeeId)}/benefits`, {
          body: input,
          bodySchema: employeeBenefitInputSchema,
          schema: employeeBenefitSchema,
        }),
      updateAssignment: (employeeId: string, id: string, input: EmployeeBenefitInput) =>
        request(
          'PUT',
          `/employees/${encodeURIComponent(employeeId)}/benefits/${encodeURIComponent(id)}`,
          { body: input, bodySchema: employeeBenefitInputSchema, schema: employeeBenefitSchema },
        ),
      removeAssignment: (employeeId: string, id: string) =>
        request(
          'DELETE',
          `/employees/${encodeURIComponent(employeeId)}/benefits/${encodeURIComponent(id)}`,
        ),
    },
    conversations: {
      // ─── Funcionário ───
      mine: () =>
        request('GET', '/me/conversations', { schema: z.array(conversationSummarySchema) }),
      start: (input: ConversationStart) =>
        request('POST', '/me/conversations', {
          body: input,
          bodySchema: conversationStartSchema,
          schema: conversationDetailSchema,
        }),
      /** Abrir marca como lidas as mensagens do RH. */
      openMine: (id: string) =>
        request('GET', `/me/conversations/${encodeURIComponent(id)}`, {
          schema: conversationDetailSchema,
        }),
      replyMine: (id: string, input: ConversationMessageInput) =>
        request('POST', `/me/conversations/${encodeURIComponent(id)}/messages`, {
          body: input,
          bodySchema: conversationMessageInputSchema,
          schema: conversationMessageSchema,
        }),
      myUnread: () =>
        request('GET', '/me/conversations/unread', { schema: conversationUnreadSchema }),
      /** Link temporário de um anexo da conversa (funcionário ou RH). */
      attachment: (conversationId: string, fileId: string) =>
        request(
          'GET',
          `/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(fileId)}`,
          { schema: downloadLinkSchema },
        ),
      // ─── RH ───
      list: (query: ConversationListQuery = {}) =>
        request('GET', '/conversations', { query, schema: z.array(conversationSummarySchema) }),
      get: (id: string) =>
        request('GET', `/conversations/${encodeURIComponent(id)}`, {
          schema: conversationDetailSchema,
        }),
      reply: (id: string, input: ConversationMessageInput) =>
        request('POST', `/conversations/${encodeURIComponent(id)}/messages`, {
          body: input,
          bodySchema: conversationMessageInputSchema,
          schema: conversationMessageSchema,
        }),
      close: (id: string) =>
        request('POST', `/conversations/${encodeURIComponent(id)}/close`, {
          schema: conversationSummarySchema,
        }),
      reopen: (id: string) =>
        request('POST', `/conversations/${encodeURIComponent(id)}/reopen`, {
          schema: conversationSummarySchema,
        }),
      unread: () => request('GET', '/conversations/unread', { schema: conversationUnreadSchema }),
    },
    push: {
      /** Registra o aparelho para receber notificações (app mobile). */
      register: (input: PushDeviceInput) =>
        request('POST', '/me/push-devices', { body: input, bodySchema: pushDeviceInputSchema }),
      unregister: (token: string) =>
        request('DELETE', `/me/push-devices/${encodeURIComponent(token)}`),
    },
    usefulLinks: {
      ...crud('/useful-links', usefulLinkSchema, usefulLinkInputSchema),
      mine: () => request('GET', '/me/useful-links', { schema: z.array(usefulLinkSchema) }),
    },
    payroll: {
      list: () => request('GET', '/payroll-periods', { schema: z.array(payrollPeriodSchema) }),
      get: (id: string) =>
        request('GET', `/payroll-periods/${encodeURIComponent(id)}`, {
          schema: payrollPeriodDetailSchema,
        }),
      /** Gera (ou gera de novo, se não estiver fechado) o fechamento do mês. */
      generate: (month: string) =>
        request('POST', '/payroll-periods', {
          body: { month },
          bodySchema: payrollGenerateSchema,
          schema: payrollPeriodDetailSchema,
        }),
      publish: (id: string) =>
        request('POST', `/payroll-periods/${encodeURIComponent(id)}/publish`, {
          schema: payrollPeriodSchema,
        }),
      close: (id: string) =>
        request('POST', `/payroll-periods/${encodeURIComponent(id)}/close`, {
          schema: payrollPeriodSchema,
        }),
      /** Arquivo CSV para o escritório de contabilidade. */
      exportCsv: (id: string) =>
        requestText('GET', `/payroll-periods/${encodeURIComponent(id)}/export`),
      mine: () =>
        request('GET', '/me/payroll-previews', { schema: z.array(myPayrollPreviewSchema) }),
    },
    patrols: {
      mine: () => request('GET', '/me/patrols', { schema: myPatrolsSchema }),
      /** Inicia a ronda. Use a mesma idempotencyKey ao reenviar. */
      start: (routeId: string, idempotencyKey: string) =>
        request('POST', '/me/patrol-runs', {
          body: { routeId },
          bodySchema: patrolRunStartSchema,
          schema: patrolRunSchema,
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      checkin: (runId: string, input: PatrolCheckinInput, idempotencyKey: string) =>
        request('POST', `/me/patrol-runs/${encodeURIComponent(runId)}/checkins`, {
          body: input,
          bodySchema: patrolCheckinInputSchema,
          schema: patrolRunSchema,
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      finish: (runId: string, input: PatrolRunFinish = {}) =>
        request('POST', `/me/patrol-runs/${encodeURIComponent(runId)}/finish`, {
          body: input,
          bodySchema: patrolRunFinishSchema,
          schema: patrolRunSchema,
        }),
      board: (date: string) =>
        request('GET', '/patrol-runs/board', { query: { date }, schema: patrolBoardSchema }),
      get: (runId: string) =>
        request('GET', `/patrol-runs/${encodeURIComponent(runId)}`, { schema: patrolRunSchema }),
    },
    shifts: crud('/shifts', shiftSchema, shiftInputSchema),
    workSchedules: crud('/work-schedules', workScheduleSchema, workScheduleInputSchema),
    holidays: {
      list: (year: number) =>
        request('GET', '/holidays', { query: { year }, schema: z.array(holidaySchema) }),
      suggestions: (year: number) =>
        request('GET', '/holidays/national-suggestions', {
          query: { year },
          schema: z.array(z.object({ date: z.string(), name: z.string(), legalBasis: z.string() })),
        }),
      create: (input: HolidayInput) =>
        request('POST', '/holidays', {
          body: input,
          bodySchema: holidayInputSchema,
          schema: holidaySchema,
        }),
      update: (id: string, input: HolidayInput) =>
        request('PUT', `/holidays/${encodeURIComponent(id)}`, {
          body: input,
          bodySchema: holidayInputSchema,
          schema: holidaySchema,
        }),
      remove: (id: string) => request('DELETE', `/holidays/${encodeURIComponent(id)}`),
    },
    time: {
      /** Marca o ponto. Use a mesma idempotencyKey ao reenviar a mesma marcação. */
      clock: (input: ClockInput, idempotencyKey: string) =>
        request('POST', '/me/time-entries', {
          body: input,
          bodySchema: clockInputSchema,
          schema: timeEntrySchema,
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      mine: (from: string, to: string) =>
        request('GET', '/me/time-entries', {
          query: { from, to },
          schema: z.array(timeEntrySchema),
        }),
      myTimesheet: (month: string) =>
        request('GET', '/me/timesheet', { query: { month }, schema: timesheetSchema }),
      receipt: (entryId: string) =>
        request('GET', `/time-entries/${encodeURIComponent(entryId)}/receipt`, {
          schema: clockReceiptSchema,
        }),
      forEmployee: (employeeId: string, from: string, to: string) =>
        request('GET', `/employees/${encodeURIComponent(employeeId)}/time-entries`, {
          query: { from, to },
          schema: z.array(timeEntrySchema),
        }),
      timesheet: (employeeId: string, month: string) =>
        request('GET', `/employees/${encodeURIComponent(employeeId)}/timesheet`, {
          query: { month },
          schema: timesheetSchema,
        }),
      /** Quadro do dia: marcações e escala de cada funcionário no escopo. */
      daily: (query: DailyAttendanceQuery) =>
        request('GET', '/time-entries/daily', { query, schema: dailyAttendanceSchema }),
      verify: (employeeId: string) =>
        request('GET', `/employees/${encodeURIComponent(employeeId)}/time-entries-verification`, {
          schema: chainVerificationSchema,
        }),
      settings: () => request('GET', '/clock-settings', { schema: clockSettingsSchema }),
      updateSettings: (input: ClockSettings) =>
        request('PUT', '/clock-settings', {
          body: input,
          bodySchema: clockSettingsSchema,
          schema: clockSettingsSchema,
        }),
    },
    adjustments: {
      request: (input: AdjustmentInput) =>
        request('POST', '/me/time-adjustments', {
          body: input,
          bodySchema: adjustmentInputSchema,
          schema: adjustmentSchema,
        }),
      requestFor: (employeeId: string, input: AdjustmentInput) =>
        request('POST', `/employees/${encodeURIComponent(employeeId)}/time-adjustments`, {
          body: input,
          bodySchema: adjustmentInputSchema,
          schema: adjustmentSchema,
        }),
      mine: () => request('GET', '/me/time-adjustments', { schema: z.array(adjustmentSchema) }),
      cancel: (id: string) =>
        request('POST', `/me/time-adjustments/${encodeURIComponent(id)}/cancel`, {
          schema: adjustmentSchema,
        }),
      toApprove: (status?: 'pending' | 'approved' | 'rejected' | 'cancelled') =>
        request('GET', '/time-adjustments', {
          query: { status },
          schema: z.array(adjustmentSchema),
        }),
      approve: (id: string, input: AdjustmentDecision = {}) =>
        request('POST', `/time-adjustments/${encodeURIComponent(id)}/approve`, {
          body: input,
          bodySchema: adjustmentDecisionSchema,
          schema: adjustmentSchema,
        }),
      reject: (id: string, input: AdjustmentDecision) =>
        request('POST', `/time-adjustments/${encodeURIComponent(id)}/reject`, {
          body: input,
          bodySchema: adjustmentDecisionSchema,
          schema: adjustmentSchema,
        }),
    },
    announcements: {
      /** Mural do usuário: comunicados publicados e vigentes para ele. */
      feed: () => request('GET', '/me/announcements', { schema: myAnnouncementFeedSchema }),
      /** Abre o comunicado e registra a leitura. */
      open: (id: string) =>
        request('GET', `/me/announcements/${encodeURIComponent(id)}`, {
          schema: myAnnouncementSchema,
        }),
      acknowledge: (id: string) =>
        request('POST', `/me/announcements/${encodeURIComponent(id)}/acknowledge`, {
          schema: myAnnouncementSchema,
        }),
      list: (status?: AnnouncementStatus) =>
        request('GET', '/announcements', {
          query: { status },
          schema: z.array(announcementSchema),
        }),
      get: (id: string) =>
        request('GET', `/announcements/${encodeURIComponent(id)}`, { schema: announcementSchema }),
      create: (input: AnnouncementInput) =>
        request('POST', '/announcements', {
          body: input,
          bodySchema: announcementInputSchema,
          schema: announcementSchema,
        }),
      update: (id: string, input: AnnouncementInput) =>
        request('PUT', `/announcements/${encodeURIComponent(id)}`, {
          body: input,
          bodySchema: announcementInputSchema,
          schema: announcementSchema,
        }),
      remove: (id: string) => request('DELETE', `/announcements/${encodeURIComponent(id)}`),
      publish: (id: string) =>
        request('POST', `/announcements/${encodeURIComponent(id)}/publish`, {
          schema: announcementSchema,
        }),
      archive: (id: string) =>
        request('POST', `/announcements/${encodeURIComponent(id)}/archive`, {
          schema: announcementSchema,
        }),
      receipts: (id: string) =>
        request('GET', `/announcements/${encodeURIComponent(id)}/receipts`, {
          schema: z.array(announcementReceiptSchema),
        }),
    },
    medicalCertificates: {
      submit: (input: MedicalCertificateInput) =>
        request('POST', '/me/medical-certificates', {
          body: input,
          bodySchema: medicalCertificateInputSchema,
          schema: medicalCertificateSchema,
        }),
      mine: () =>
        request('GET', '/me/medical-certificates', { schema: z.array(medicalCertificateSchema) }),
      myDocument: (id: string) =>
        request('GET', `/me/medical-certificates/${encodeURIComponent(id)}/document`, {
          schema: downloadLinkSchema,
        }),
      cancel: (id: string) =>
        request('POST', `/me/medical-certificates/${encodeURIComponent(id)}/cancel`, {
          schema: medicalCertificateSchema,
        }),
      registerFor: (employeeId: string, input: MedicalCertificateInput) =>
        request('POST', `/employees/${encodeURIComponent(employeeId)}/medical-certificates`, {
          body: input,
          bodySchema: medicalCertificateInputSchema,
          schema: medicalCertificateSchema,
        }),
      list: (query: MedicalCertificateListQuery = {}) =>
        request('GET', '/medical-certificates', {
          query,
          schema: z.array(medicalCertificateSchema),
        }),
      /** CID e link do documento. Cada chamada fica registrada na auditoria. */
      sensitive: (id: string) =>
        request('GET', `/medical-certificates/${encodeURIComponent(id)}/sensitive`, {
          schema: medicalCertificateSensitiveSchema,
        }),
      accept: (id: string, input: MedicalCertificateReview = {}) =>
        request('POST', `/medical-certificates/${encodeURIComponent(id)}/accept`, {
          body: input,
          bodySchema: medicalCertificateReviewSchema,
          schema: medicalCertificateSchema,
        }),
      reject: (id: string, input: MedicalCertificateReview) =>
        request('POST', `/medical-certificates/${encodeURIComponent(id)}/reject`, {
          body: input,
          bodySchema: medicalCertificateReviewSchema,
          schema: medicalCertificateSchema,
        }),
    },
    schedule: {
      assignments: (employeeId: string) =>
        request('GET', `/employees/${encodeURIComponent(employeeId)}/schedule-assignments`, {
          schema: z.array(scheduleAssignmentSchema),
        }),
      assign: (employeeId: string, input: ScheduleAssignmentInput) =>
        request('POST', `/employees/${encodeURIComponent(employeeId)}/schedule-assignments`, {
          body: input,
          bodySchema: scheduleAssignmentInputSchema,
          schema: scheduleAssignmentSchema,
        }),
      unassign: (employeeId: string, assignmentId: string) =>
        request(
          'DELETE',
          `/employees/${encodeURIComponent(employeeId)}/schedule-assignments/${encodeURIComponent(assignmentId)}`,
        ),
      planned: (employeeId: string, from: string, to: string) =>
        request('GET', `/employees/${encodeURIComponent(employeeId)}/planned-schedule`, {
          query: { from, to },
          schema: z.array(plannedDaySchema),
        }),
      mine: (from: string, to: string) =>
        request('GET', '/me/planned-schedule', {
          query: { from, to },
          schema: z.array(plannedDaySchema),
        }),
    },
    employees: {
      list: async (query: EmployeeListQuery = {}) => {
        const { search, unitId, departmentId, status, page, pageSize } =
          employeeListQuerySchema.parse(query);
        return request('GET', '/employees', {
          query: { search, unitId, departmentId, status, page, pageSize },
          schema: employeePageSchema,
        });
      },
      get: (id: string) =>
        request('GET', `/employees/${encodeURIComponent(id)}`, { schema: employeeSchema }),
      mine: () => request('GET', '/me/employee', { schema: employeeSchema }),
      /** Linha do tempo do funcionário (cadastro, escalas, benefícios, atestados, ajustes). */
      history: (id: string) =>
        request('GET', `/employees/${encodeURIComponent(id)}/history`, {
          schema: z.array(employeeHistoryEventSchema),
        }),
      create: (input: EmployeeInput) =>
        request('POST', '/employees', {
          body: input,
          bodySchema: employeeInputSchema,
          schema: employeeSchema,
        }),
      update: (id: string, input: EmployeeInput) =>
        request('PUT', `/employees/${encodeURIComponent(id)}`, {
          body: input,
          bodySchema: employeeInputSchema,
          schema: employeeSchema,
        }),
      createAccount: (id: string, input: CreateAccountInput) =>
        request('POST', `/employees/${encodeURIComponent(id)}/account`, {
          body: input,
          bodySchema: createAccountInputSchema,
          schema: createdAccountSchema,
        }),
      importTemplate: () => requestText('GET', '/employees/imports/template'),
      import: (input: EmployeeImportRequest) =>
        request('POST', '/employees/imports', {
          body: input,
          bodySchema: employeeImportRequestSchema,
          schema: employeeImportReportSchema,
        }),
    },
    auth: {
      login: (input: LoginRequest) =>
        request('POST', '/auth/login', {
          body: input,
          bodySchema: loginRequestSchema,
          schema: loginResponseSchema,
          ...noRetry,
        }),
      verifyMfa: (mfaToken: string, input: MfaCodeRequest) =>
        request('POST', '/auth/mfa/verify', {
          body: input,
          bodySchema: mfaCodeRequestSchema,
          schema: authenticatedResponseSchema,
          token: mfaToken,
        }),
      /** Sem `token`, usa o access token (ativação voluntária). */
      setupMfa: (token?: string) =>
        request('POST', '/auth/mfa/setup', {
          schema: mfaSetupResponseSchema,
          ...(token ? { token } : {}),
        }),
      activateMfa: (input: MfaCodeRequest, token?: string) =>
        request('POST', '/auth/mfa/activate', {
          body: input,
          bodySchema: mfaCodeRequestSchema,
          schema: mfaActivateResponseSchema,
          ...(token ? { token } : {}),
        }),
      refresh: (input: RefreshRequest = {}) =>
        request('POST', '/auth/refresh', {
          body: input,
          bodySchema: refreshRequestSchema,
          schema: authenticatedResponseSchema,
          ...noRetry,
        }),
      logout: (input: RefreshRequest = {}) =>
        request('POST', '/auth/logout', {
          body: input,
          bodySchema: refreshRequestSchema,
          ...noRetry,
        }),
      me: () => request('GET', '/auth/me', { schema: authUserSchema }),
      changePassword: (input: ChangePasswordInput) =>
        request('POST', '/auth/password', { body: input, bodySchema: changePasswordInputSchema }),
    },
    access: {
      mine: () => request('GET', '/me/access', { schema: myAccessSchema }),
      permissions: () => request('GET', '/permissions', { schema: z.array(permissionInfoSchema) }),
      roles: {
        list: () => request('GET', '/roles', { schema: z.array(roleSchema) }),
        get: (id: string) =>
          request('GET', `/roles/${encodeURIComponent(id)}`, { schema: roleSchema }),
        create: (input: RoleInput) =>
          request('POST', '/roles', {
            body: input,
            bodySchema: roleInputSchema,
            schema: roleSchema,
          }),
        update: (id: string, input: RoleInput) =>
          request('PUT', `/roles/${encodeURIComponent(id)}`, {
            body: input,
            bodySchema: roleInputSchema,
            schema: roleSchema,
          }),
        remove: (id: string) => request('DELETE', `/roles/${encodeURIComponent(id)}`),
      },
      users: {
        list: () => request('GET', '/users', { schema: z.array(userWithRolesSchema) }),
        /** Apaga o MFA do usuário e encerra as sessões: no próximo login ele cadastra de novo. */
        resetMfa: (userId: string) =>
          request('POST', `/users/${encodeURIComponent(userId)}/mfa/reset`, {
            schema: userWithRolesSchema,
          }),
        assignRoles: (userId: string, input: AssignRolesInput) =>
          request('PUT', `/users/${encodeURIComponent(userId)}/roles`, {
            body: input,
            bodySchema: assignRolesInputSchema,
            schema: userWithRolesSchema,
          }),
      },
    },
    audit: {
      list: async (query: AuditLogQuery = {}) => {
        const { limit, ...rest } = auditLogQuerySchema.parse(query);
        return request('GET', '/audit-logs', {
          query: { ...rest, limit },
          schema: auditLogPageSchema,
        });
      },
    },
    files: {
      createUpload: (input: UploadRequest) =>
        request('POST', '/files/uploads', {
          body: input,
          bodySchema: uploadRequestSchema,
          schema: uploadTicketSchema,
        }),
      confirm: (fileId: string) =>
        request('POST', `/files/${encodeURIComponent(fileId)}/confirm`, {
          schema: storedFileSchema,
        }),
      get: (fileId: string) =>
        request('GET', `/files/${encodeURIComponent(fileId)}`, { schema: storedFileSchema }),
      downloadLink: (fileId: string) =>
        request('GET', `/files/${encodeURIComponent(fileId)}/download-link`, {
          schema: downloadLinkSchema,
        }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function readProblem(response: Response): Promise<ProblemDetails> {
  try {
    const parsed = problemDetailsSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data;
  } catch {
    // corpo não é JSON
  }
  return {
    type: ProblemType.Default,
    title: response.statusText || 'Erro',
    status: response.status,
  };
}

async function isUnauthenticated(response: Response): Promise<boolean> {
  const problem = await readProblem(response);
  return problem.type === ProblemType.Unauthenticated;
}
