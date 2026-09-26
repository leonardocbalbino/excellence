import { describe, expect, it } from 'vitest';
import { EMPTY_SCOPE } from '../../access-control/domain/data-scope';
import { canAddress, reaches } from './audience';

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const D1 = '00000000-0000-4000-8000-00000000000d';

describe('canAddress', () => {
  it('escopo da empresa fala com qualquer público', () => {
    const scope = { ...EMPTY_SCOPE, companyWide: true };
    expect(canAddress(scope, { unitIds: [], departmentIds: [] })).toBe(true);
    expect(canAddress(scope, { unitIds: [U1], departmentIds: [D1] })).toBe(true);
  });

  it('escopo de unidade só fala com as próprias unidades, nunca com a empresa toda', () => {
    const scope = { ...EMPTY_SCOPE, unitIds: [U1] };
    expect(canAddress(scope, { unitIds: [U1], departmentIds: [] })).toBe(true);
    expect(canAddress(scope, { unitIds: [U1, U2], departmentIds: [] })).toBe(false);
    expect(canAddress(scope, { unitIds: [], departmentIds: [] })).toBe(false);
    expect(canAddress(scope, { unitIds: [], departmentIds: [D1] })).toBe(false);
  });

  it('equipe própria não delimita público', () => {
    const scope = { ...EMPTY_SCOPE, ownTeam: true };
    expect(canAddress(scope, { unitIds: [U1], departmentIds: [] })).toBe(false);
  });
});

describe('reaches', () => {
  it('público da empresa alcança todos, inclusive quem não tem cadastro de funcionário', () => {
    expect(reaches({ unitIds: [], departmentIds: [] }, null)).toBe(true);
  });

  it('alcança por unidade ou por departamento', () => {
    const audience = { unitIds: [U1], departmentIds: [D1] };
    expect(reaches(audience, { unitId: U1, departmentId: null })).toBe(true);
    expect(reaches(audience, { unitId: U2, departmentId: D1 })).toBe(true);
    expect(reaches(audience, { unitId: U2, departmentId: null })).toBe(false);
    expect(reaches(audience, null)).toBe(false);
  });
});
