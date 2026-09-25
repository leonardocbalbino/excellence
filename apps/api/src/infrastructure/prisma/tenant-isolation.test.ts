import { describe, expect, it } from 'vitest';
import { applyTenantIsolation, TENANT_MODELS, TenantViolationError } from './tenant-isolation';

const A = '01900000-0000-7000-8000-00000000000a';
const B = '01900000-0000-7000-8000-00000000000b';

describe('TENANT_MODELS', () => {
  it('inclui os modelos com companyId e exclui catálogos globais', () => {
    expect(TENANT_MODELS.has('User')).toBe(true);
    expect(TENANT_MODELS.has('Role')).toBe(true);
    expect(TENANT_MODELS.has('UserRole')).toBe(true);
    expect(TENANT_MODELS.has('Permission')).toBe(false);
    expect(TENANT_MODELS.has('Company')).toBe(false);
  });
});

describe('applyTenantIsolation', () => {
  it('acrescenta o filtro da empresa em AND, preservando o where original', () => {
    expect(applyTenantIsolation('User', 'findMany', { where: { isActive: true } }, A)).toEqual({
      where: { isActive: true, AND: [{ companyId: A }] },
    });
  });

  it('preserva AND existente (objeto ou lista)', () => {
    expect(
      applyTenantIsolation('User', 'findFirst', { where: { AND: { name: 'x' } } }, A).where,
    ).toEqual({ AND: [{ name: 'x' }, { companyId: A }] });
    expect(
      applyTenantIsolation('User', 'count', { where: { AND: [{ a: 1 }, { b: 2 }] } }, A).where,
    ).toEqual({ AND: [{ a: 1 }, { b: 2 }, { companyId: A }] });
  });

  it('filtra consultas sem where e findUnique (campo único no topo)', () => {
    expect(applyTenantIsolation('Role', 'findMany', {}, A)).toEqual({
      where: { AND: [{ companyId: A }] },
    });
    expect(applyTenantIsolation('Role', 'findUnique', { where: { id: 'r1' } }, A)).toEqual({
      where: { id: 'r1', AND: [{ companyId: A }] },
    });
  });

  it('pedir outra empresa no where resulta em filtro contraditório (vazio), não em vazamento', () => {
    expect(applyTenantIsolation('User', 'findMany', { where: { companyId: B } }, A).where).toEqual({
      companyId: B,
      AND: [{ companyId: A }],
    });
  });

  it.each(['update', 'updateMany', 'delete', 'deleteMany', 'aggregate', 'groupBy'])(
    'filtra %s',
    (operation) => {
      const result = applyTenantIsolation('Role', operation, { where: { id: 'r' } }, A);
      expect(result.where).toEqual({ id: 'r', AND: [{ companyId: A }] });
    },
  );

  it('preenche companyId em create e createMany', () => {
    expect(applyTenantIsolation('Role', 'create', { data: { name: 'x' } }, A)).toEqual({
      data: { name: 'x', companyId: A },
    });
    expect(
      applyTenantIsolation('Role', 'createMany', { data: [{ name: 'x' }, { name: 'y' }] }, A),
    ).toEqual({
      data: [
        { name: 'x', companyId: A },
        { name: 'y', companyId: A },
      ],
    });
  });

  it('bloqueia gravação em outra empresa', () => {
    expect(() =>
      applyTenantIsolation('Role', 'create', { data: { name: 'x', companyId: B } }, A),
    ).toThrow(TenantViolationError);
    expect(() =>
      applyTenantIsolation('Role', 'update', { where: { id: 'r' }, data: { companyId: B } }, A),
    ).toThrow(TenantViolationError);
  });

  it('upsert: filtra o where e fixa a empresa no create', () => {
    const result = applyTenantIsolation(
      'Role',
      'upsert',
      { where: { id: 'r' }, create: { name: 'x' }, update: { name: 'y' } },
      A,
    );
    expect(result).toEqual({
      where: { id: 'r', AND: [{ companyId: A }] },
      create: { name: 'x', companyId: A },
      update: { name: 'y' },
    });
  });

  it('Company: só a própria empresa é visível e não se cria nem exclui empresa', () => {
    expect(applyTenantIsolation('Company', 'findMany', {}, A)).toEqual({
      where: { AND: [{ id: A }] },
    });
    expect(() => applyTenantIsolation('Company', 'create', { data: {} }, A)).toThrow(
      TenantViolationError,
    );
    expect(() => applyTenantIsolation('Company', 'deleteMany', {}, A)).toThrow(
      TenantViolationError,
    );
  });

  it('não altera modelos globais', () => {
    const args = { where: { key: 'roles:read' } };
    expect(applyTenantIsolation('Permission', 'findUnique', args, A)).toBe(args);
  });
});
