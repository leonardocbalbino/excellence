/**
 * Feriados nacionais de data fixa definidos em lei federal. É uma **sugestão** para o RH
 * conferir antes de salvar (pendência P-011): feriados estaduais, municipais, religiosos
 * municipais (Lei 9.093/1995, ex.: Sexta-feira da Paixão) e pontos facultativos (Carnaval,
 * Corpus Christi) não entram aqui e são cadastrados pela empresa.
 */
export const NATIONAL_FIXED_HOLIDAYS = [
  { monthDay: '01-01', name: 'Confraternização Universal', law: 'Lei 662/1949' },
  { monthDay: '04-21', name: 'Tiradentes', law: 'Lei 662/1949' },
  { monthDay: '05-01', name: 'Dia do Trabalho', law: 'Lei 662/1949' },
  { monthDay: '09-07', name: 'Independência do Brasil', law: 'Lei 662/1949' },
  { monthDay: '10-12', name: 'Nossa Senhora Aparecida', law: 'Lei 6.802/1980' },
  { monthDay: '11-02', name: 'Finados', law: 'Lei 10.607/2002' },
  { monthDay: '11-15', name: 'Proclamação da República', law: 'Lei 662/1949' },
  {
    monthDay: '11-20',
    name: 'Dia Nacional de Zumbi e da Consciência Negra',
    law: 'Lei 14.759/2023',
  },
  { monthDay: '12-25', name: 'Natal', law: 'Lei 662/1949' },
] as const;

export function nationalHolidaySuggestions(year: number) {
  return NATIONAL_FIXED_HOLIDAYS.map((holiday) => ({
    date: `${year}-${holiday.monthDay}`,
    name: holiday.name,
    legalBasis: holiday.law,
  }));
}
