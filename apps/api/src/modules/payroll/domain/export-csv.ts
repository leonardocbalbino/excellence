import { BENEFIT_KIND_LABELS, type PayrollItem } from '@excellence/shared';

/** 510 → "08:30"; -75 → "-01:15". */
export function formatHours(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** 1234.5 → "1234,50" (sem separador de milhar, como planilhas e sistemas de folha leem). */
export function formatMoney(value: number | null): string {
  return value === null ? '' : value.toFixed(2).replace('.', ',');
}

function cell(value: string | number): string {
  const text = String(value);
  // Aspas quando houver separador, aspas ou quebra; e sem começar por fórmula (injeção CSV).
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return /[;"\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const HEADER = [
  'Matrícula',
  'Nome',
  'CPF',
  'Posto de trabalho',
  'Departamento',
  'Cargo',
  'Admissão',
  'Desligamento',
  'Salário base',
  'Horas previstas',
  'Horas trabalhadas',
  'Saldo de horas',
  'Faltas (dias)',
  'Dias com atestado',
  'Dias com marcação incompleta',
  'Ajustes pendentes',
  'Benefícios (valor empresa)',
  'Benefícios (desconto funcionário)',
  'Benefícios (detalhe)',
];

/**
 * CSV do fechamento para o escritório de contabilidade: separador ";", decimais com vírgula
 * e BOM para o Excel abrir com acentos.
 */
export function payrollCsv(month: string, items: readonly PayrollItem[]): string {
  const rows = items.map((item) => [
    item.employee.registrationNumber,
    item.employee.name,
    item.employee.cpf,
    item.unit,
    item.department ?? '',
    item.position ?? '',
    item.hireDate,
    item.terminationDate ?? '',
    formatMoney(item.baseSalary),
    formatHours(item.plannedMinutes),
    formatHours(item.workedMinutes),
    formatHours(item.balanceMinutes),
    item.absenceDays,
    item.justifiedDays,
    item.incompleteDays,
    item.pendingAdjustments,
    formatMoney(item.benefitsCompanyTotal),
    formatMoney(item.benefitsDiscountTotal),
    item.benefits
      .map(
        (b) =>
          `${b.name} (${BENEFIT_KIND_LABELS[b.kind]}): empresa ${formatMoney(b.companyValue)}, desconto ${formatMoney(b.employeeDiscount)}`,
      )
      .join(' | '),
  ]);
  const lines = [[`Competência ${month}`], HEADER, ...rows].map((row) => row.map(cell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
