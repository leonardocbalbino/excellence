import { describe, expect, it, vi } from 'vitest';
import { ProblemType } from '../errors/problem-details.js';
import { ApiError, ApiUnavailableError, createApiClient } from './api-client.js';

const USER = {
  id: '01900000-0000-7000-8000-000000000101',
  companyId: '01900000-0000-7000-8000-000000000001',
  name: 'Ana',
  email: 'ana@exemplo.com.br',
  mfaEnabled: false,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const unauthenticated = () =>
  json(401, { type: ProblemType.Unauthenticated, title: 'Unauthorized', status: 401 });

function setup(
  responses: Response[],
  overrides: Partial<Parameters<typeof createApiClient>[0]> = {},
) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  let token: string | null = 'token-1';
  const client = createApiClient({
    baseUrl: '/api/v1',
    getAccessToken: () => token,
    fetch,
    credentials: 'include',
    ...overrides,
  });
  return { client, fetch, setToken: (t: string | null) => (token = t) };
}

const headersOf = (call: Parameters<typeof globalThis.fetch> | undefined) =>
  (call?.[1]?.headers ?? {}) as Record<string, string>;

describe('createApiClient', () => {
  it('envia o access token e valida a resposta com o schema', async () => {
    const { client, fetch } = setup([json(200, USER)]);
    await expect(client.auth.me()).resolves.toEqual(USER);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/auth/me');
    expect(init?.credentials).toBe('include');
    expect(headersOf(fetch.mock.calls[0])).toMatchObject({ Authorization: 'Bearer token-1' });
  });

  it('usa o token informado (MFA) no lugar do access token', async () => {
    const { client, fetch } = setup([json(200, { secret: 'S', otpauthUrl: 'otpauth://x' })]);
    await client.auth.setupMfa('mfa-token');
    expect(headersOf(fetch.mock.calls[0]).Authorization).toBe('Bearer mfa-token');
  });

  it('renova a sessão em 401 e repete a chamada uma vez', async () => {
    const refreshSession = vi.fn(() => Promise.resolve(true));
    const { client, fetch, setToken } = setup([unauthenticated(), json(200, USER)], {
      refreshSession: async () => {
        setToken('token-2');
        return refreshSession();
      },
    });
    await expect(client.auth.me()).resolves.toEqual(USER);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(headersOf(fetch.mock.calls[1]).Authorization).toBe('Bearer token-2');
  });

  it('não tenta renovar quando o 401 não é de sessão (ex.: credenciais erradas no login)', async () => {
    const refreshSession = vi.fn(() => Promise.resolve(true));
    const { client } = setup(
      [json(401, { type: ProblemType.InvalidCredentials, title: 'Unauthorized', status: 401 })],
      { refreshSession },
    );
    await expect(client.auth.login({ email: 'a@b.com', password: 'x' })).rejects.toMatchObject({
      type: ProblemType.InvalidCredentials,
    });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('desiste se a renovação falhar', async () => {
    const { client, fetch } = setup([unauthenticated()], {
      refreshSession: () => Promise.resolve(false),
    });
    await expect(client.auth.me()).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('expõe Problem Details e erros por campo', async () => {
    const { client } = setup([
      json(400, {
        type: ProblemType.Validation,
        title: 'Bad Request',
        status: 400,
        errors: [{ path: 'name', message: 'Muito curto' }],
      }),
    ]);
    const error = await client.access.roles
      .create({ name: 'Ok', permissions: [], scopes: [{ type: 'self' }] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldErrors).toEqual({ name: 'Muito curto' });
  });

  it('valida a entrada antes de enviar', async () => {
    const { client, fetch } = setup([]);
    await expect(client.auth.login({ email: 'nao-e-email', password: 'x' })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('trata resposta sem Problem Details e falha de rede', async () => {
    const { client } = setup([new Response('<html>', { status: 502, statusText: 'Bad Gateway' })]);
    await expect(client.auth.me()).rejects.toMatchObject({
      status: 502,
      problem: { title: 'Bad Gateway' },
    });

    const offline = createApiClient({
      baseUrl: '/api/v1',
      getAccessToken: () => null,
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await expect(offline.auth.me()).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('recusa resposta fora do contrato', async () => {
    const { client } = setup([json(200, { id: 'não é uuid' })]);
    await expect(client.auth.me()).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('monta query string e trata 204', async () => {
    const { client, fetch } = setup([
      json(200, { items: [], nextCursor: null }),
      new Response(null, { status: 204 }),
    ]);
    await client.audit.list({ action: 'auth.login_succeeded', limit: 10 });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/v1/audit-logs?action=auth.login_succeeded&limit=10',
    );
    await expect(client.access.roles.remove('abc')).resolves.toBeUndefined();
  });

  it('aceita baseUrl absoluta (mobile)', async () => {
    const { client, fetch } = setup([json(200, USER)], {
      baseUrl: 'https://api.exemplo.com.br/api/v1',
    });
    await client.auth.me();
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.exemplo.com.br/api/v1/auth/me');
  });
});
