/** Período de um atestado: dias inteiros ou, num único dia, uma faixa de minutos. */
export interface CertificatePeriod {
  startDate: string;
  endDate: string;
  startMinute: number | null;
  endMinute: number | null;
}

/**
 * Dois atestados se sobrepõem quando os dias se cruzam e, se ambos forem por horas, as
 * faixas de horário também. Um atestado de dia inteiro cobre qualquer declaração de horas
 * do mesmo dia.
 */
export function periodsOverlap(a: CertificatePeriod, b: CertificatePeriod): boolean {
  if (a.startDate > b.endDate || b.startDate > a.endDate) return false;
  if (a.startMinute === null || a.endMinute === null) return true;
  if (b.startMinute === null || b.endMinute === null) return true;
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/** Dias corridos do período, contando início e fim. */
export function periodDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
