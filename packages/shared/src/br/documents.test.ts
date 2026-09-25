import { describe, expect, it } from 'vitest';
import {
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  isValidPis,
  normalizeCnpj,
} from './documents.js';

describe('CPF', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(['529.982.247-24', '111.111.111-11', '123', '', '5299822472a'])('recusa %j', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it('formata', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
  });
});

describe('CNPJ', () => {
  it.each(['11.222.333/0001-81', '11222333000181', '45.723.174/0001-10'])(
    'aceita numérico %s',
    (cnpj) => {
      expect(isValidCnpj(cnpj)).toBe(true);
    },
  );

  it('aceita o alfanumérico (exemplo da Receita: 12.ABC.345/01DE-35)', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true);
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(formatCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });

  it.each(['11.222.333/0001-80', '12.ABC.345/01DE-36', '00000000000000', '12ABC34501DEAB', '123'])(
    'recusa %s',
    (cnpj) => {
      expect(isValidCnpj(cnpj)).toBe(false);
    },
  );
});

describe('PIS/NIS', () => {
  it('aceita número válido e recusa inválido', () => {
    expect(isValidPis('120.56178.63-1')).toBe(true);
    expect(isValidPis('12056178638')).toBe(false);
    expect(isValidPis('11111111111')).toBe(false);
  });
});
