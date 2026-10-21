import type { BenefitDaysSummary } from '@excellence/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';
import { currentMonth } from '../time-tracking/labels';

const EMPLOYEE_ID = '01900000-0000-7000-8000-000000000704';

const summary: BenefitDaysSummary = {
  month: '2026-10',
  cutoffDate: '2026-10-20',
  period: null,
  rows: [
    {
      employee: { id: EMPLOYEE_ID, name: 'Fábio Vigia', registrationNumber: '0004' },
      unit: 'Maple Bear',
      food: {
        days: 15,
        dailyValue: 25,
        total: 375,
        calculated: { days: 15, dailyValue: 25, total: 375 },
        adjustment: null,
      },
      transport: {
        days: 15,
        dailyValue: 10,
        total: 150,
        calculated: { days: 15, dailyValue: 10, total: 150 },
        adjustment: null,
      },
      total: 525,
    },
  ],
  totals: {
    employees: 1,
    food: { days: 15, total: 375 },
    transport: { days: 15, total: 150 },
    total: 525,
  },
  units: [
    {
      unit: 'Maple Bear',
      employees: 1,
      food: { days: 15, total: 375 },
      transport: { days: 15, total: 150 },
      total: 525,
    },
  ],
};

describe('VA/VT', () => {
  it('mostra VA e VT por colaborador, o total geral e ajusta uma exceção', async () => {
    let sent: unknown;
    server.use(
      ...sessionHandlers(['payroll:manage']),
      http.get(`${API}/benefit-days`, () => HttpResponse.json(summary)),
      http.put(`${API}/benefit-days/adjustments`, async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderApp('/gestao/va-vt');
    expect(await screen.findByRole('heading', { name: 'VA/VT' })).toBeInTheDocument();
    const total = (await screen.findByText('Total VA + VT', { selector: 'h2' })).closest('section');
    if (!total) throw new Error('Cartão do total não encontrado');
    expect(within(total).getByText('R$ 525,00')).toBeInTheDocument();
    expect(screen.getByText('Fábio Vigia', { selector: 'a' })).toBeInTheDocument();
    expect(screen.getByText('Empresa')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ajustar VA/VT de Fábio Vigia' }));
    await user.selectOptions(screen.getByLabelText('Benefício'), 'transport');
    await user.type(screen.getByLabelText('Quantidade de dias'), '18');
    await user.type(screen.getByLabelText('Motivo'), 'Cobertura no posto Centro');
    await user.click(screen.getByRole('button', { name: 'Salvar ajuste' }));
    await waitFor(() =>
      expect(sent).toEqual({
        employeeId: EMPLOYEE_ID,
        // A tela abre no mês atual.
        month: currentMonth(),
        kind: 'transport',
        days: 18,
        dailyValue: null,
        reason: 'Cobertura no posto Centro',
      }),
    );
  });
});
