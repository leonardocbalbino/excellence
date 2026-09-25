import type { AuthUser, MyAccess, Permission } from '@excellence/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/** Nos testes a API é absoluta: o fetch do Node não aceita URL relativa. */
export const API = 'http://localhost/api/v1';

export const TEST_USER: AuthUser = {
  id: '01900000-0000-7000-8000-000000000101',
  companyId: '01900000-0000-7000-8000-000000000001',
  name: 'Ana Administradora',
  email: 'admin@exemplo.com.br',
  mfaEnabled: false,
};

export function authenticated(user: AuthUser = TEST_USER) {
  return { status: 'authenticated' as const, accessToken: 'access-token', expiresIn: 900, user };
}

export const problem = (status: number, type: string, detail?: string) =>
  HttpResponse.json(
    { type, title: 'Erro', status, ...(detail ? { detail } : {}) },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );

/** Sessão restaurada pelo cookie e acesso com as permissões informadas. */
export function sessionHandlers(permissions: Permission[], access: Partial<MyAccess> = {}) {
  return [
    http.post(`${API}/auth/refresh`, () => HttpResponse.json(authenticated())),
    http.get(`${API}/me/access`, () =>
      HttpResponse.json({ permissions, mfaSetupRequired: false, ...access }),
    ),
  ];
}

// Padrão: ninguém logado (o refresh pelo cookie falha).
export const server = setupServer(
  http.post(`${API}/auth/refresh`, () =>
    problem(401, 'urn:excellence:problem:invalid-refresh-token'),
  ),
);
