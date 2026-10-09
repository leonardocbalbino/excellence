import type { PayrollItem, TimesheetDay } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { formatHours, formatMoney, payrollCsv } from './export-csv';
import { cutoffDate, summarizeDays } from './month-summary';

const shift = {
  id: '01900000-0000-7000-8000-000000000901',
  name: 'Comercial',
  start: '08:00',
  end: '17:00',
  crossesMidnight: false,
  breakMinutes: 60,
  workMinutes: 480,
};

function day(date: string, overrides: Partial<TimesheetDay> = {}): TimesheetDay {
  return {
    date,
    planned: {
      date,
      unassigned: false,
      scheduleId: null,
      shift,
      flexibleWeeklyMinutes: null,
      holiday: null,
    },
    entries: [],
    workedMinutes: 0,
    incomplete: false,
    pendingAdjustments: 0,
    justifications: [],
    ...overrides,
  };
}

const entry = {
  id: '01900000-0000-7000-8000-000000000e01',
  localTime: '08:00',
  nextDay: false,
  kind: 'clock' as const,
  geofenceStatus: 'inside' as const,
};

describe('cutoffDate', () => {
  it('mês encerrado conta até o último dia; mês corrente, até ontem', () => {
    expect(cutoffDate('2026-08', '2026-09-26')).toBe('2026-08-31');
    expect(cutoffDate('2026-09', '2026-09-26')).toBe('2026-09-25');
    expect(cutoffDate('2026-02', '2026-03-01')).toBe('2026-02-28');
  });
});

describe('summarizeDays', () => {
  it('soma previsto e trabalhado; separa falta, atestado e marcação incompleta', () => {
    const totals = summarizeDays(
      [
        day('2026-09-01', { entries: [entry, entry], workedMinutes: 500 }),
        day('2026-09-02'),
        day('2026-09-03', {
          justifications: [
            { type: 'medical_certificate', id: entry.id, startTime: null, endTime: null },
          ],
        }),
        day('2026-09-04', { entries: [entry], incomplete: true, pendingAdjustments: 1 }),
        // Feriado sem marcação não é falta nem conta como previsto.
        day('2026-09-07', {
          planned: {
            ...day('2026-09-07').planned,
            holiday: { id: entry.id, name: 'Independência', scope: 'national' },
          },
        }),
        // Fora do intervalo (admissão ou corte): ignorado.
        day('2026-09-30'),
      ],
      '2026-09-01',
      '2026-09-25',
    );
    expect(totals).toEqual({
      plannedMinutes: 4 * 480,
      workedMinutes: 500,
      balanceMinutes: 500 - 4 * 480,
      absenceDays: 1,
      justifiedDays: 1,
      incompleteDays: 1,
      pendingAdjustments: 1,
    });
  });
});

describe('payrollCsv', () => {
  const item: PayrollItem = {
    employee: {
      id: '01900000-0000-7000-8000-000000000704',
      name: '=Fábio; "Vigia"',
      registrationNumber: '0004',
      cpf: '10000000442',
    },
    unit: 'Matriz',
    department: null,
    position: 'Vigilante',
    hireDate: '2023-05-15',
    terminationDate: null,
    baseSalary: 2350.5,
    plannedMinutes: 9600,
    workedMinutes: 9525,
    balanceMinutes: -75,
    absenceDays: 1,
    justifiedDays: 0,
    incompleteDays: 0,
    pendingAdjustments: 0,
    benefits: [{ name: 'VT', kind: 'transport', companyValue: 220, employeeDiscount: 141.03 }],
    benefitsCompanyTotal: 220,
    benefitsDiscountTotal: 141.03,
  };

  it('formata horas e valores no padrão brasileiro', () => {
    expect(formatHours(510)).toBe('08:30');
    expect(formatHours(-75)).toBe('-01:15');
    expect(formatMoney(2350.5)).toBe('2350,50');
    expect(formatMoney(null)).toBe('');
  });

  it('gera o CSV com BOM, ";" e protege contra fórmulas', () => {
    const csv = payrollCsv('2026-09', [item]);
    expect(csv.startsWith('\uFEFFCompetência 2026-09\r\nMatrícula;Nome;CPF')).toBe(true);
    const line = csv.split('\r\n')[2] ?? '';
    expect(line).toContain('"\'=Fábio; ""Vigia"""');
    expect(line).toContain(';2350,50;160:00;158:45;-01:15;1;0;0;0;220,00;141,03;');
    expect(line).toContain('VT (Vale-transporte): empresa 220,00, desconto 141,03');
  });
});
