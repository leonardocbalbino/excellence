import { formatCpf } from '@excellence/shared';

export interface FieldChange {
  label: string;
  before: string | null;
  after: string | null;
}

type Snapshot = Record<string, unknown>;

/** Campos do cadastro mostrados no histórico, na ordem da tela. */
const FIELDS: { key: string; label: string; format?: (value: unknown) => string | null }[] = [
  { key: 'name', label: 'Nome' },
  { key: 'socialName', label: 'Nome social' },
  { key: 'cpf', label: 'CPF', format: (v) => (typeof v === 'string' ? formatCpf(v) : null) },
  { key: 'pis', label: 'PIS/NIS' },
  { key: 'birthDate', label: 'Data de nascimento', format: brDate },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefone' },
  { key: 'registrationNumber', label: 'Matrícula' },
  { key: 'hireDate', label: 'Admissão', format: brDate },
  { key: 'terminationDate', label: 'Desligamento', format: brDate },
  { key: 'unit', label: 'Posto de trabalho', format: refName },
  { key: 'department', label: 'Departamento', format: refName },
  { key: 'position', label: 'Cargo', format: refName },
  { key: 'union', label: 'Sindicato', format: refName },
  { key: 'manager', label: 'Gestor direto', format: refName },
];

/** "2026-09-26" → "26/09/2026". */
export function brDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d ?? ''}/${m ?? ''}/${y ?? ''}`;
}

function refName(value: unknown): string | null {
  if (value && typeof value === 'object' && 'name' in value) {
    const name = value.name;
    return typeof name === 'string' ? name : null;
  }
  return null;
}

function plain(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

/**
 * O que mudou entre duas fotos do cadastro (como gravadas na auditoria), campo a campo, já
 * formatado para leitura. Campos iguais ficam de fora.
 */
export function employeeChanges(before: Snapshot, after: Snapshot): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of FIELDS) {
    const format = field.format ?? plain;
    const a = format(before[field.key]);
    const b = format(after[field.key]);
    if (a !== b) changes.push({ label: field.label, before: a, after: b });
  }
  return changes;
}
