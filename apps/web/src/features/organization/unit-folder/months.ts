const MONTH_NAMES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** "2026-10" → "out/2026". */
export function formatMonth(month: string): string {
  const [year = '', number = '1'] = month.split('-');
  return `${MONTH_NAMES[Number(number) - 1] ?? number}/${year}`;
}

/** "2026-12" → "2027-01". */
export function nextMonth(month: string): string {
  const [year = 0, number = 1] = month.split('-').map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
}
