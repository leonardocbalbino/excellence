import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  companyId: string;
  userId: string;
  requestId?: string | undefined;
  ip?: string | undefined;
}

const storage = new AsyncLocalStorage<RequestContextData>();

export class MissingRequestContextError extends Error {
  constructor() {
    super('Operação exige contexto de empresa (usuário autenticado), mas não há nenhum.');
    this.name = 'MissingRequestContextError';
  }
}

/**
 * Contexto da requisição autenticada (empresa, usuário, request ID), propagado por
 * AsyncLocalStorage para os serviços. Base do isolamento por empresa e da auditoria.
 */
export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn);
  },

  current(): RequestContextData | undefined {
    return storage.getStore();
  },

  /** Falha fechado: sem contexto, a operação não prossegue. */
  require(): RequestContextData {
    const data = storage.getStore();
    if (!data) throw new MissingRequestContextError();
    return data;
  },
};
