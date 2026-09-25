import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// Aceita só IDs curtos e seguros para não abrir espaço a injeção nos logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Reaproveita o X-Request-Id recebido (se for seguro) ou gera um novo, e o devolve na resposta. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  return requestId;
}
