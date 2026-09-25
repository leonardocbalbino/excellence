import { type ApiClient, ApiError, ApiUnavailableError, createApiClient } from '@excellence/shared';
import { createContext, useContext, useSyncExternalStore } from 'react';
import { type SessionState, SessionStore } from './session';

export interface Services {
  api: ApiClient;
  session: SessionStore;
}

/** Monta client HTTP e sessão ligados entre si (o client renova a sessão em 401). */
export function createServices(
  baseUrl: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
): Services {
  const holder: { session?: SessionStore } = {};
  const api = createApiClient({
    baseUrl,
    credentials: 'include',
    clientName: 'web',
    getAccessToken: () => holder.session?.accessToken() ?? null,
    refreshSession: () => holder.session?.refresh() ?? Promise.resolve(false),
  });
  holder.session = new SessionStore({
    refresh: () => api.auth.refresh(),
    logout: () => api.auth.logout(),
    locks: typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined,
    channel:
      typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('excellence-auth'),
  });
  return { api, session: holder.session };
}

export const ServicesContext = createContext<Services | null>(null);

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

/** Mensagem amigável para exibir ao usuário a partir de qualquer erro. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  if (error instanceof ApiUnavailableError) {
    return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
  }
  return 'Algo deu errado. Tente de novo.';
}
