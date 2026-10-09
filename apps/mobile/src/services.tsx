import { type ApiClient, ApiError, ApiUnavailableError, createApiClient } from '@excellence/shared';
import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import { MobileSession, type SessionState } from './session';

export interface Services {
  api: ApiClient;
  session: MobileSession;
}

function apiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error('Defina EXPO_PUBLIC_API_URL (veja apps/mobile/.env.example).');
  return url.replace(/\/$/, '');
}

/** Client HTTP e sessão ligados entre si: o client renova a sessão ao receber 401. */
export function createServices(): Services {
  const holder: { session?: MobileSession } = {};
  const api = createApiClient({
    baseUrl: apiUrl(),
    clientName: 'mobile',
    getAccessToken: () => holder.session?.accessToken() ?? null,
    refreshSession: () => holder.session?.refresh() ?? Promise.resolve(false),
  });
  holder.session = new MobileSession({
    refresh: (refreshToken) => api.auth.refresh({ refreshToken, client: 'mobile' }),
    logout: (refreshToken) => api.auth.logout({ refreshToken, client: 'mobile' }),
  });
  return { api, session: holder.session };
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: Services;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices fora do ServicesProvider');
  return services;
}

export function useApi(): ApiClient {
  return useServices().api;
}

export function useSession(): SessionState {
  const { session } = useServices();
  return useSyncExternalStore(session.subscribe, session.getState);
}

/**
 * Falha que vale tentar de novo depois (vai para a fila offline): sem conexão ou servidor fora
 * do ar (5xx). Resposta fora do contrato e erros 4xx não melhoram tentando de novo.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500;
  if (error instanceof ApiUnavailableError) {
    return !error.message.startsWith('Resposta fora do contrato');
  }
  return error instanceof TypeError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  if (isRetryable(error)) return 'Sem conexão com o servidor.';
  return error instanceof Error ? error.message : 'Algo deu errado.';
}
