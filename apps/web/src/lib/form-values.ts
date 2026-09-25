/**
 * Conversores para `setValueAs` do React Hook Form. Recebem o valor do campo, que pode ser
 * texto digitado ou o valor inicial (inclusive null/number), e devolvem o formato do schema.
 */

/** Texto vazio (ou ausente) vira null. */
export function emptyToNull(value: unknown): string | null {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  return text.trim() === '' ? null : text;
}

/** Número (aceita vírgula decimal); vazio vira null. */
export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return value;
  const text = emptyToNull(value);
  return text === null ? null : Number(text.replace(',', '.'));
}
