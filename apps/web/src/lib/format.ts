/** 480 → "8h", 510 → "8h30". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}

const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const longDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' });

/** Datas de calendário (AAAA-MM-DD) são exibidas sem conversão de fuso. */
function calendar(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "2026-09-25" → "sex., 25/09". */
export function formatDayLabel(date: string): string {
  return `${weekday.format(calendar(date))}, ${shortDate.format(calendar(date))}`;
}

/** "2026-09-25" → "25/09/2026". */
export function formatDate(date: string): string {
  return longDate.format(calendar(date));
}

/** Hoje (fuso do navegador) como AAAA-MM-DD, e soma de dias. */
export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function addDaysIso(date: string, days: number): string {
  return new Date(calendar(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
