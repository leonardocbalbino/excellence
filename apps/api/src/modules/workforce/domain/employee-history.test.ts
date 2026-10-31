import { describe, expect, it } from 'vitest';
import { brDate, employeeChanges } from './employee-history';

describe('employeeChanges', () => {
  const before = {
    name: 'Fábio Funcionário',
    cpf: '10000000442',
    phone: null,
    unit: { id: 'u1', name: 'Matriz — São Luís' },
    manager: null,
    hireDate: '2023-05-15',
  };

  it('lista só os campos que mudaram, formatados para leitura', () => {
    const after = {
      ...before,
      phone: '98999998888',
      unit: { id: 'u2', name: 'Posto Anil' },
      manager: { id: 'm1', name: 'Gabriela Gestora' },
    };
    expect(employeeChanges(before, after)).toEqual([
      { label: 'Telefone', before: null, after: '98999998888' },
      { label: 'Posto de trabalho', before: 'Matriz — São Luís', after: 'Posto Anil' },
      { label: 'Gestor direto', before: null, after: 'Gabriela Gestora' },
    ]);
  });

  it('sem mudança, lista vazia; datas e CPF saem formatados', () => {
    expect(employeeChanges(before, { ...before })).toEqual([]);
    expect(employeeChanges(before, { ...before, hireDate: '2023-06-01' })).toEqual([
      { label: 'Admissão', before: '15/05/2023', after: '01/06/2023' },
    ]);
    expect(employeeChanges({ cpf: '10000000442' }, { cpf: '10000000353' })[0]?.before).toBe(
      '100.000.004-42',
    );
    expect(brDate('nada')).toBeNull();
  });
});
