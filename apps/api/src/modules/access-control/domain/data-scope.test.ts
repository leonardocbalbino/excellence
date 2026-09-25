import { describe, expect, it } from 'vitest';
import { EMPTY_SCOPE, fromRoleScope, isEmptyScope, mergeScopes, toRoleScope } from './data-scope';

const U1 = '01900000-0000-7000-8000-000000000001';
const U2 = '01900000-0000-7000-8000-000000000002';
const D1 = '01900000-0000-7000-8000-000000000003';

describe('mergeScopes', () => {
  it('une unidades e departamentos sem repetir', () => {
    expect(
      mergeScopes([
        { type: 'unit', unitId: U1 },
        { type: 'unit', unitId: U2 },
        { type: 'unit', unitId: U1 },
        { type: 'department', departmentId: D1 },
        { type: 'own_team' },
      ]),
    ).toEqual({
      companyWide: false,
      unitIds: [U1, U2],
      departmentIds: [D1],
      ownTeam: true,
      self: false,
    });
  });

  it('empresa inteira absorve os demais escopos', () => {
    expect(
      mergeScopes([{ type: 'self' }, { type: 'company' }, { type: 'unit', unitId: U1 }]),
    ).toEqual({
      ...EMPTY_SCOPE,
      companyWide: true,
    });
  });

  it('sem escopos resulta em escopo vazio', () => {
    expect(isEmptyScope(mergeScopes([]))).toBe(true);
    expect(isEmptyScope(mergeScopes([{ type: 'self' }]))).toBe(false);
  });
});

describe('conversão de escopo', () => {
  it.each([
    { type: 'company' as const },
    { type: 'unit' as const, unitId: U1 },
    { type: 'department' as const, departmentId: D1 },
    { type: 'own_team' as const },
    { type: 'self' as const },
  ])('ida e volta: %j', (scope) => {
    expect(toRoleScope(fromRoleScope(scope))).toEqual(scope);
  });

  it('grava colunas nulas fora do tipo correspondente', () => {
    expect(fromRoleScope({ type: 'unit', unitId: U1 })).toEqual({
      type: 'unit',
      unitId: U1,
      departmentId: null,
    });
  });
});
