import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { resolveRequestId } from './request-id';

function call(header?: string | string[]) {
  const req = {
    headers: header === undefined ? {} : { 'x-request-id': header },
  } as IncomingMessage;
  const setHeader = vi.fn();
  const id = resolveRequestId(req, { setHeader } as unknown as ServerResponse);
  return { id, setHeader };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reaproveita um ID seguro recebido e o devolve na resposta', () => {
    const { id, setHeader } = call('abc-123_DEF.456');
    expect(id).toBe('abc-123_DEF.456');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'abc-123_DEF.456');
  });

  it('gera UUID quando não há header', () => {
    expect(call().id).toMatch(UUID);
  });

  it.each([['curto'], ['com espaço e\nquebra de linha'], ['x'.repeat(129)]])(
    'descarta ID inseguro: %j',
    (value) => {
      expect(call(value).id).toMatch(UUID);
    },
  );

  it('usa o primeiro valor quando o header vem repetido', () => {
    expect(call(['primeiro-id', 'segundo-id']).id).toBe('primeiro-id');
  });
});
