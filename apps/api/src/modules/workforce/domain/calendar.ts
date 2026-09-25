/**
 * Datas de calendário (sem hora) guardadas em colunas DATE. O Prisma as representa como
 * meia-noite UTC; aqui convertemos de/para "AAAA-MM-DD" sem deslocamento de fuso.
 */
export function toCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function fromCalendarDate(value: Date): string;
export function fromCalendarDate(value: Date | null): string | null;
export function fromCalendarDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** "Hoje" no fuso informado (ex.: fuso da empresa), como "AAAA-MM-DD". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Situação do funcionário: ativo até o dia do desligamento, inclusive (é o último dia de
 * trabalho); desligado a partir do dia seguinte.
 */
export function employeeStatus(
  terminationDate: string | null,
  today: string,
): 'active' | 'terminated' {
  return terminationDate !== null && terminationDate < today ? 'terminated' : 'active';
}
