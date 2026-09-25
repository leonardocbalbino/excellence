/**
 * Conversão entre instantes UTC e data/hora locais de um fuso IANA, sem bibliotecas.
 * O horário oficial é sempre UTC (regra 4); o fuso da unidade é só para exibir e para
 * interpretar horários informados por pessoas (ex.: ajuste "incluir 08:00 do dia 10").
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function parts(instant: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
}

/** Instante UTC → data (AAAA-MM-DD), hora (HH:MM) e minutos do dia no fuso. */
export function toZoned(
  instant: Date,
  timeZone: string,
): { date: string; time: string; minuteOfDay: number } {
  const p = parts(instant, timeZone);
  const hour = Number(p.hour);
  const minute = Number(p.minute);
  return {
    date: `${p.year ?? ''}-${p.month ?? ''}-${p.day ?? ''}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minuteOfDay: hour * 60 + minute,
  };
}

/** Diferença (ms) entre o horário local do fuso e o UTC naquele instante. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Data e hora locais no fuso → instante UTC. Resolve com duas iterações para acertar o
 * deslocamento em datas próximas a mudanças de horário.
 */
export function fromZoned(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const naive = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  let guess = naive - offsetMs(new Date(naive), timeZone);
  guess = naive - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}
