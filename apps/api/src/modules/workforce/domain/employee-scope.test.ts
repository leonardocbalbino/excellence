import { describe, expect, it } from 'vitest';
import { EMPTY_SCOPE } from '../../access-control/domain/data-scope';
import { employeeStatus, todayIn } from './calendar';
import { employeeScopeWhere, isInScope } from './employee-scope';

const actor = { userId: 'user-1', employeeId: 'emp-manager' };

const employee = (overrides: Partial<Parameters<typeof isInScope>[2]> = {}) => ({
  unitId: 'unit-a',
  departmentId: 'dep-x',
  managerId: null,
  userId: null,
  ...overrides,
});

describe('employeeScopeWhere', () => {
  it('empresa inteira não filtra', () => {
    expect(employeeScopeWhere({ ...EMPTY_SCOPE, companyWide: true }, actor)).toEqual({});
  });

  it('une unidades, departamentos, equipe e o próprio registro', () => {
    expect(
      employeeScopeWhere(
        {
          ...EMPTY_SCOPE,
          unitIds: ['unit-a'],
          departmentIds: ['dep-y'],
          ownTeam: true,
          self: true,
        },
        actor,
      ),
    ).toEqual({
      OR: [
        { unitId: { in: ['unit-a'] } },
        { departmentId: { in: ['dep-y'] } },
        { managerId: 'emp-manager' },
        { userId: 'user-1' },
      ],
    });
  });

  it('equipe sem registro de funcionário não alcança ninguém', () => {
    expect(
      employeeScopeWhere({ ...EMPTY_SCOPE, ownTeam: true }, { userId: 'u', employeeId: null }),
    ).toBeNull();
  });

  it('escopo vazio não alcança ninguém', () => {
    expect(employeeScopeWhere(EMPTY_SCOPE, actor)).toBeNull();
  });
});

describe('isInScope', () => {
  it.each([
    [{ ...EMPTY_SCOPE, companyWide: true }, employee(), true],
    [{ ...EMPTY_SCOPE, unitIds: ['unit-a'] }, employee(), true],
    [{ ...EMPTY_SCOPE, unitIds: ['unit-b'] }, employee(), false],
    [{ ...EMPTY_SCOPE, departmentIds: ['dep-x'] }, employee(), true],
    [{ ...EMPTY_SCOPE, departmentIds: ['dep-x'] }, employee({ departmentId: null }), false],
    [{ ...EMPTY_SCOPE, ownTeam: true }, employee({ managerId: 'emp-manager' }), true],
    [{ ...EMPTY_SCOPE, ownTeam: true }, employee({ managerId: 'outro' }), false],
    [{ ...EMPTY_SCOPE, self: true }, employee({ userId: 'user-1' }), true],
    [{ ...EMPTY_SCOPE, self: true }, employee({ userId: 'user-2' }), false],
  ])('%j / %j → %s', (scope, target, expected) => {
    expect(isInScope(scope, actor, target)).toBe(expected);
  });
});

describe('situação do funcionário', () => {
  it('segue ativo no próprio dia do desligamento', () => {
    expect(employeeStatus(null, '2026-09-25')).toBe('active');
    expect(employeeStatus('2026-09-25', '2026-09-25')).toBe('active');
    expect(employeeStatus('2026-09-24', '2026-09-25')).toBe('terminated');
    expect(employeeStatus('2026-10-01', '2026-09-25')).toBe('active');
  });

  it('calcula "hoje" no fuso da empresa', () => {
    // 02:30 UTC de 26/09 ainda é 25/09 em São Paulo (UTC-3).
    const instant = new Date('2026-09-26T02:30:00Z');
    expect(todayIn('America/Sao_Paulo', instant)).toBe('2026-09-25');
    expect(todayIn('UTC', instant)).toBe('2026-09-26');
    expect(todayIn('America/Manaus', new Date('2026-09-26T03:30:00Z'))).toBe('2026-09-25');
  });
});
