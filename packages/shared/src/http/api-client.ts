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
  employeeSchema,
} from '../workforce/employees.schemas.js';

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
