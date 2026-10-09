import { parsePatrolCode } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { formatCode, newCodeToken, tokensMatch } from './code';

describe('código do QR', () => {
  it('formata e lê de volta o ponto e o token', () => {
    const token = newCodeToken();
    expect(token).toMatch(/^[\w-]{22}$/);
    const code = formatCode('01900000-0000-7000-8000-000000000a01', token);
    expect(parsePatrolCode(code)).toEqual({
      pointId: '01900000-0000-7000-8000-000000000a01',
      token,
    });
  });

  it('recusa conteúdo que não é de ponto de ronda', () => {
    expect(parsePatrolCode('https://exemplo.com')).toBeNull();
    expect(parsePatrolCode('EXR1.nao-e-uuid.abc')).toBeNull();
    expect(parsePatrolCode('EXR1.01900000-0000-7000-8000-000000000a01')).toBeNull();
  });

  it('compara tokens sem aceitar diferenças de tamanho', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abd')).toBe(false);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
  });
});
