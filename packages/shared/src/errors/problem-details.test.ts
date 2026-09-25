import { describe, expect, it } from 'vitest';
import { isProblemDetails, problemDetailsSchema, ProblemType } from './problem-details.js';

describe('problemDetailsSchema', () => {
  it('aplica type padrão about:blank', () => {
    const parsed = problemDetailsSchema.parse({ title: 'Not Found', status: 404 });
    expect(parsed.type).toBe('about:blank');
  });

  it('aceita erros de validação por campo', () => {
    const parsed = problemDetailsSchema.parse({
      title: 'Bad Request',
      status: 400,
      errors: [{ path: 'email', message: 'E-mail inválido' }],
    });
    expect(parsed.errors).toHaveLength(1);
  });

  it('rejeita status fora da faixa de erro', () => {
    expect(isProblemDetails({ title: 'OK', status: 200 })).toBe(false);
  });

  it('rejeita objeto sem title', () => {
    expect(isProblemDetails({ status: 500 })).toBe(false);
  });
});

describe('ProblemType', () => {
  it('usa URNs estáveis para tipos específicos', () => {
    expect(ProblemType.Validation).toMatch(/^urn:excellence:problem:/);
  });

  it('aceita requestId como membro de extensão', () => {
    const parsed = problemDetailsSchema.parse({
      title: 'Bad Request',
      status: 400,
      requestId: 'abc',
    });
    expect(parsed.requestId).toBe('abc');
  });
});
