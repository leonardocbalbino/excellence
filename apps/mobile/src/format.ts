/** Hoje (fuso do aparelho) como AAAA-MM-DD. */
export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

/** "2026-09-26" → "26/09/2026". */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d ?? ''}/${m ?? ''}/${y ?? ''}`;
}

/** 510 → "8h30". */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  const rest = abs % 60;
  return `${sign}${String(Math.floor(abs / 60))}h${rest ? String(rest).padStart(2, '0') : ''}`;
}

export function formatBRL(value: number | null): string {
  return value === null
    ? '—'
    : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Hora local HH:MM de um instante. */
export function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
