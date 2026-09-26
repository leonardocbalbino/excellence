import type { Announcement } from '@excellence/shared';

export const announcementsQueryKey = ['announcements'] as const;

export const ANNOUNCEMENT_STATUS: Record<Announcement['status'], string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function formatInstant(value: string): string {
  return dateTime.format(new Date(value));
}

/** "Toda a empresa" ou "Matriz, Operações". */
export function audienceLabel(audience: Announcement['audience']): string {
  if (audience.companyWide) return 'Toda a empresa';
  return [...audience.units, ...audience.departments].map((item) => item.name).join(', ');
}

/** ISO (UTC) ↔ valor de <input type="datetime-local"> no fuso do navegador. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
