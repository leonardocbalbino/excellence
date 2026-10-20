import type {
  Employee,
  ScheduleRate,
  Unit,
  UnitMonthlySummary,
  WorkSchedule,
} from '@excellence/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const UNIT_ID = '01900000-0000-7000-8000-000000000a01';
const SCHEDULE_ID = '01900000-0000-7000-8000-000000000b01';
const EMPLOYEE_ID = '01900000-0000-7000-8000-000000000704';

const unit: Unit = {
  id: UNIT_ID,
  name: 'Maple Bear',
  code: 'MB',
  cnpj: null,
  street: null,
  number: null,
  complement: null,
  district: null,
  city: 'São Luís',
  state: 'MA',
  postalCode: null,
  latitude: null,
  longitude: null,
  geofenceRadiusMeters: null,
  timezone: null,
  isActive: true,
};

const schedule: WorkSchedule = {
  id: SCHEDULE_ID,
  unit: { id: UNIT_ID, name: 'Maple Bear' },
  name: '12x36 diurno',
  code: null,
  kind: 'cycle',
  cycleAnchor: 'assignment',
  days: ['01900000-0000-7000-8000-000000000901', null],
  weeklyMinutes: null,
  notes: null,
  isActive: true,
  employeeCount: 1,
};

const summary: UnitMonthlySummary = {
  unit: { id: UNIT_ID, name: 'Maple Bear' },
  month: '2026-10',
  cutoffDate: '2026-10-16',
  period: null,
  items: [
    {
      employee: {
        id: EMPLOYEE_ID,
        name: 'Fábio Vigia',
        registrationNumber: '0004',
        cpf: '10000000442',
      },
      unit: 'Maple Bear',
      department: null,
      position: 'Vigilante',
      hireDate: '2023-05-15',
      terminationDate: null,
      baseSalary: null,
      plannedMinutes: 5280,
      workedMinutes: 5280,
      balanceMinutes: 0,
      absenceDays: 1,
      justifiedDays: 1,
      incompleteDays: 0,
      pendingAdjustments: 0,
      benefits: [],
      benefitsCompanyTotal: 0,
      benefitsDiscountTotal: 0,
      shiftPay: {
        lines: [
          {
            scheduleId: SCHEDULE_ID,
            schedule: '12x36 diurno',
            rate: 180,
            shifts: 8,
            justifiedShifts: 1,
            amount: 1440,
          },
        ],
        shifts: 8,
        total: 1440,
      },
    },
  ],
  totals: {
    employees: 1,
    shifts: 8,
    shiftPay: 1440,
    absenceDays: 1,
    justifiedDays: 1,
    incompleteDays: 0,
    pendingAdjustments: 0,
  },
  certificates: [
    {
      id: '01900000-0000-7000-8000-000000000c01',
      employee: { id: EMPLOYEE_ID, name: 'Fábio Vigia' },
      startDate: '2026-10-07',
      endDate: '2026-10-07',
      status: 'accepted',
    },
  ],
  scheduleChanges: [],
};

describe('Pasta do posto (condomínio)', () => {
  it('cadastra o valor por plantão com vigência e mostra o resumo do mês', async () => {
    let rates: ScheduleRate[] = [];
    let sent: unknown;
    server.use(
      ...sessionHandlers(['units:read', 'schedules:read', 'payroll:manage']),
      http.get(`${API}/units/:id`, () => HttpResponse.json(unit)),
      http.get(`${API}/work-schedules`, ({ request }) => {
        // A pasta só pede as escalas do próprio posto.
        expect(new URL(request.url).searchParams.get('unitId')).toBe(UNIT_ID);
        return HttpResponse.json([schedule]);
      }),
      http.get(`${API}/units/:id/schedule-rates`, () => HttpResponse.json(rates)),
      http.put(`${API}/units/:id/schedule-rates`, async ({ request }) => {
        sent = await request.json();
        const rate: ScheduleRate = {
          id: '01900000-0000-7000-8000-000000000d01',
          scheduleId: SCHEDULE_ID,
          scheduleName: '12x36 diurno',
          validFrom: '2026-11',
          amount: 180,
        };
        rates = [rate];
        return HttpResponse.json(rate);
      }),
      http.get(`${API}/units/:id/monthly-summary`, () => HttpResponse.json(summary)),
    );

    renderApp(`/cadastros/postos/${UNIT_ID}?aba=valores`);
    expect(await screen.findByRole('heading', { name: 'Maple Bear' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Escala'), SCHEDULE_ID);
    const from = screen.getByLabelText('A partir de');
    await user.clear(from);
    await user.type(from, '2026-11');
    await user.type(screen.getByLabelText('Valor por plantão (R$)'), '180,00');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(sent).toEqual({ scheduleId: SCHEDULE_ID, validFrom: '2026-11', amount: 180 }),
    );
    expect(await screen.findByRole('cell', { name: '12x36 diurno' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Resumo mensal' }));
    const valueCard = (await screen.findByText('Valor dos plantões')).closest('section');
    if (!valueCard) throw new Error('Cartão de valor não encontrado');
    expect(within(valueCard).getByText('R$ 1.440,00')).toBeInTheDocument();
    expect(screen.getByText('Fábio Vigia', { selector: 'a' })).toBeInTheDocument();
    expect(screen.getByText(/8 ×/)).toBeInTheDocument();
    expect(screen.getByText('Atestados do mês')).toBeInTheDocument();
  });

  it('traz para o posto um funcionário já cadastrado em outro posto', async () => {
    const elsewhere: Employee = {
      id: EMPLOYEE_ID,
      registrationNumber: '0004',
      name: 'Fábio Vigia',
      socialName: null,
      cpf: '10000000442',
      pis: null,
      birthDate: null,
      email: null,
      phone: null,
      hireDate: '2023-05-15',
      terminationDate: null,
      status: 'active',
      unit: { id: '01900000-0000-7000-8000-000000000a02', name: 'Outro condomínio' },
      department: null,
      position: null,
      union: null,
      manager: null,
      userId: null,
    };
    let sent: unknown;
    server.use(
      ...sessionHandlers(['units:read', 'employees:read', 'employees:manage']),
      http.get(`${API}/units/:id`, () => HttpResponse.json(unit)),
      http.get(`${API}/employees`, ({ request }) => {
        const inUnit = new URL(request.url).searchParams.get('unitId') === UNIT_ID;
        const items = inUnit ? (sent ? [{ ...elsewhere, unit }] : []) : [elsewhere];
        return HttpResponse.json({ items, total: items.length, page: 1, pageSize: 100 });
      }),
      http.put(`${API}/employees/:id/unit`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...elsewhere, unit: { id: UNIT_ID, name: 'Maple Bear' } });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderApp(`/cadastros/postos/${UNIT_ID}`);
    expect(await screen.findByText('Nenhum funcionário neste posto.')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Adicionar já cadastrado' }));
    await user.type(screen.getByLabelText('Buscar funcionário já cadastrado'), 'Fábio');
    expect(await screen.findByRole('cell', { name: 'Outro condomínio' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trazer para este posto' }));
    await waitFor(() => expect(sent).toEqual({ unitId: UNIT_ID }));
    expect(await screen.findByRole('link', { name: 'Fábio Vigia' })).toBeInTheDocument();
  });

  it('sem permissão de folha, a pasta não mostra valores nem resumo', async () => {
    server.use(
      ...sessionHandlers(['units:read', 'employees:read']),
      http.get(`${API}/units/:id`, () => HttpResponse.json(unit)),
      http.get(`${API}/employees`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 }),
      ),
    );
    renderApp(`/cadastros/postos/${UNIT_ID}`);
    expect(await screen.findByText('Nenhum funcionário neste posto.')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Funcionários', 'Dados do posto']);
  });
});
