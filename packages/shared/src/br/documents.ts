/**
 * Validação de documentos brasileiros pelos dígitos verificadores. Não consulta a Receita:
 * só garante que o número é bem formado.
 */

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function mod11(values: readonly number[], weights: readonly number[]): number {
  const sum = values.reduce((acc, value, i) => acc + value * (weights[i] ?? 0), 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function normalizeCpf(value: string): string {
  return onlyDigits(value);
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = Array.from(cpf, Number);
  const first = mod11(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = mod11(digits.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits[9] === first && digits[10] === second;
}

export function formatCpf(value: string): string {
  const cpf = normalizeCpf(value);
  return cpf.length === 11 ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : value;
}

/** CNPJ sem pontuação e em maiúsculas (o formato alfanumérico admite letras). */
export function normalizeCnpj(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/**
 * CNPJ numérico ou alfanumérico (IN RFB 2.229/2024, a partir de julho de 2026): as 12
 * primeiras posições aceitam letras e dígitos; os 2 dígitos verificadores são numéricos. O
 * valor de cada caractere no cálculo é o código ASCII menos 48 (dígitos mantêm o valor).
 */
export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const values = Array.from(cnpj, (char) => char.charCodeAt(0) - 48);
  const first = mod11(values.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = mod11(values.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return values[12] === first && values[13] === second;
}

export function formatCnpj(value: string): string {
  const cnpj = normalizeCnpj(value);
  return cnpj.length === 14
    ? cnpj.replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, '$1.$2.$3/$4-$5')
    : value;
}

/** PIS/PASEP/NIT (NIS). */
export function isValidPis(value: string): boolean {
  const pis = onlyDigits(value);
  if (!/^\d{11}$/.test(pis) || /^(\d)\1{10}$/.test(pis)) return false;
  const digits = Array.from(pis, Number);
  const sum = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2].reduce((acc, w, i) => acc + w * (digits[i] ?? 0), 0);
  const rest = 11 - (sum % 11);
  return digits[10] === (rest >= 10 ? 0 : rest);
}

export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;
