import type { BenefitDaysSummary, Employee, EmployeeBenefit } from '@excellence/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const EMPLOYEE_ID = '01900000-0000-7000-8000-000000000705';
const BENEFIT_ID = '01900000-0000-7000-8000-000000000c04';
const ASSIGNMENT_ID = '01900000-0000-7000-8000-000000000f01';

const employee: Employee = {
  id: EMPLOYEE_ID,
  registrationNumber: '0005',
  name: 'Bruna Vigilante',
  socialName: null,
  cpf: '10000000523',
  pis: null,
  birthDate: null,
  email: null,
  phone: null,
  hireDate: '2023-05-15',
  terminationDate: null,
  status: 'active',
  unit: { id: '01900000-0000-7000-8000-000000000301', name: 'Matriz — São Luís' },
  department: null,
  position: null,
  union: null,
  manager: null,
  userId: null,
};

const va: EmployeeBenefit = {
  id: ASSIGNMENT_ID,
  employee: { id: EMPLOYEE_ID, name: 'Bruna Vigilante' },
  benefit: { id: BENEFIT_ID, name: 'VA', kind: 'food', calculation: 'per_worked_day' },
  companyValue: 0,
  dailyValue: 20,
  employeeDiscount: 0,
  startDate: '2026-01-01',
  endDate: null,
  notes: null,
  active: true,
};

const line = {
  days: 15,
  dailyValue: 20,
  total: 300,
  calculated: { days: 15, dailyValue: 20, total: 300 },
  adjustment: null,
};

const summary: BenefitDaysSummary = {
  month: '2026-10',
  cutoffDate: '2026-10-20',
  period: null,
  rows: [
    {
      employee: { id: EMPLOYEE_ID, name: 'Bruna Vigilante', registrationNumber: '0005' },
      unit: 'Matriz — São Luís',
      food: line,
      transport: null,
      total: 300,
    },
  ],
  totals: {
    employees: 1,
    food: { days: 15, total: 300 },
    transport: { days: 0, total: 0 },
    total: 300,
  },
  units: [],
};

describe('Benefícios do funcionário', () => {
  it('mostra o total do mês do VA pelo ponto e edita o valor diário', async () => {
    let sent: unknown;
    server.use(
      ...sessionHandlers(['employees:read', 'benefits:manage', 'payroll:manage']),
      http.get(`${API}/employees/:id`, () => HttpResponse.json(employee)),
      http.get(`${API}/employees/:id/benefits`, () => HttpResponse.json([va])),
      http.get(`${API}/benefits`, () => HttpResponse.json([])),
      http.get(`${API}/benefit-days`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('employeeId')).toBe(EMPLOYEE_ID);
        return HttpResponse.json(summary);
      }),
      http.put(`${API}/employees/:id/benefits/:assignmentId`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...va, dailyValue: 25 });
      }),
    );

    renderApp(`/pessoas/${EMPLOYEE_ID}?aba=beneficios`);
    expect(await screen.findByText(/15 dias × R\$ 20,00 = R\$ 300,00/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Editar VA' }));
    const value = screen.getByLabelText('Valor por dia trabalhado (R$/dia)', {
      selector: `#edit-${ASSIGNMENT_ID}-value`,
    });
    await user.clear(value);
    await user.type(value, '25,00');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(sent).toMatchObject({
        benefitId: BENEFIT_ID,
        dailyValue: 25,
        startDate: '2026-01-01',
      }),
    );
  });
});
