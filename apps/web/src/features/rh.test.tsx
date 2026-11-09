import type {
  MedicalCertificate,
  MyBenefit,
  PayrollPeriodDetail,
  UsefulLink,
} from '@excellence/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const EMPLOYEE = {
  id: '01900000-0000-7000-8000-000000000704',
  name: 'Fábio Funcionário',
  registrationNumber: '0004',
};

const CLOCK_SETTINGS = {
  outsideGeofence: 'allow',
  requireLocation: false,
  requireSelfie: false,
  overnightGraceMinutes: 240,
  breakPunches: true,
  blockOffDay: true,
};

const SHIFT = {
  id: '01900000-0000-7000-8000-000000000901',
  name: 'Diurno',
  start: '07:00',
  end: '19:00',
  crossesMidnight: false,
  breakMinutes: 60,
  workMinutes: 660,
};

function workDay(overrides: Record<string, unknown> = {}) {
  return {
    workDate: '2026-11-09',
    planned: {
      date: '2026-11-09',
      unassigned: false,
      scheduleId: '01900000-0000-7000-8000-000000000902',
      shift: SHIFT,
      flexibleWeeklyMinutes: null,
      holiday: null,
    },
    breakPunches: true,
    blockOffDay: true,
    entries: [{ localTime: '07:02', nextDay: false, offline: false }],
    next: 'break_start',
    blocked: null,
    expectedExit: '19:00',
    expectedBreakEnd: null,
    ...overrides,
  };
}

function clockHandlers(day: ReturnType<typeof workDay>) {
  return [
    ...sessionHandlers([], { hasEmployeeRecord: true }),
    http.get(`${API}/clock-settings`, () => HttpResponse.json(CLOCK_SETTINGS)),
    http.get(`${API}/me/time-entries`, () => HttpResponse.json([])),
    http.get(`${API}/me/clock-day`, () => HttpResponse.json(day)),
  ];
}

describe('Registrar ponto e espelho', () => {
  it('com almoço ligado, a próxima marcação é a saída para almoço e mostra a saída prevista', async () => {
    server.use(...clockHandlers(workDay()));
    renderApp('/ponto');
    expect(
      await screen.findByRole('button', { name: 'Registrar saída para almoço' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Saída prevista 19:00')).toBeInTheDocument();
  });

  it('na folga o ponto não abre', async () => {
    server.use(
      ...clockHandlers(
        workDay({
          planned: { ...workDay().planned, shift: null, scheduleId: null },
          entries: [],
          next: null,
          blocked: 'day_off',
          expectedExit: null,
        }),
      ),
    );
    renderApp('/ponto');
    expect(await screen.findByText('Hoje é sua folga')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar/ })).not.toBeInTheDocument();
  });

  it('o espelho fica dentro de "Registrar ponto", fora do menu', async () => {
    server.use(...clockHandlers(workDay()));
    renderApp('/ponto');
    const link = await screen.findByRole('link', { name: 'Visualizar espelho de ponto' });
    expect(link).toHaveAttribute('href', '/ponto/espelho');
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).queryByRole('link', { name: /Meu ponto/ })).not.toBeInTheDocument();
  });
});

describe('Atestados na análise do RH', () => {
  const certificate: MedicalCertificate = {
    id: '01900000-0000-7000-8000-000000000e01',
    employee: EMPLOYEE,
    startDate: '2026-09-22',
    endDate: '2026-09-22',
    startTime: null,
    endTime: null,
    days: 1,
    issuerName: 'Dra. Ana',
    issuerRegistry: 'CRM 123',
    hasCid: true,
    notes: null,
    file: { name: 'atestado.pdf', contentType: 'application/pdf' },
    status: 'pending',
    submittedBy: '01900000-0000-7000-8000-000000000104',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: '2026-09-22T12:00:00.000Z',
  };

  it('mostra o documento na tela, permite baixar e marcar válido ou inválido', async () => {
    let accepted = false;
    server.use(
      ...sessionHandlers([
        'medical_certificates:read',
        'medical_certificates:read_sensitive',
        'medical_certificates:review',
      ]),
      http.get(`${API}/medical-certificates`, () => HttpResponse.json([certificate])),
      http.get(`${API}/medical-certificates/:id/sensitive`, () =>
        HttpResponse.json({
          id: certificate.id,
          cid: 'J11',
          document: {
            url: 'http://storage/atestado.pdf?download',
            expiresAt: '2026-09-22T12:05:00.000Z',
          },
          preview: {
            url: 'http://storage/atestado.pdf?inline',
            expiresAt: '2026-09-22T12:05:00.000Z',
          },
          contentType: 'application/pdf',
        }),
      ),
      http.post(`${API}/medical-certificates/:id/accept`, () => {
        accepted = true;
        return HttpResponse.json({ ...certificate, status: 'accepted' }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/atestados');
    await user.click(await screen.findByRole('button', { name: 'Ver atestado e CID' }));

    expect(await screen.findByTitle(`Atestado de ${EMPLOYEE.name}`)).toHaveAttribute(
      'src',
      'http://storage/atestado.pdf?inline',
    );
    expect(screen.getByRole('link', { name: 'Baixar' })).toHaveAttribute(
      'href',
      'http://storage/atestado.pdf?download',
    );
    expect(screen.getByText('J11')).toBeInTheDocument();

    // Inválido exige a observação.
    expect(screen.getByRole('button', { name: 'Inválido' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Válido' }));
    await vi.waitFor(() => expect(accepted).toBe(true));
  });
});

describe('Benefícios e links do funcionário', () => {
  it('lista os benefícios com valores e os links úteis', async () => {
    const benefit: MyBenefit = {
      id: '01900000-0000-7000-8000-000000000f01',
      benefit: {
        id: '01900000-0000-7000-8000-000000000c01',
        name: 'Vale-transporte',
        kind: 'transport',
        provider: 'Transporte coletivo de São Luís',
        description: 'Deslocamento casa-trabalho.',
        howToUse: 'Crédito no cartão de transporte.',
        calculation: 'monthly',
        isActive: true,
      },
      companyValue: 220,
      dailyValue: null,
      employeeDiscount: 141,
      startDate: '2024-01-01',
      endDate: null,
    };
    const link: UsefulLink = {
      id: '01900000-0000-7000-8000-000000000d01',
      name: 'Meu INSS',
      url: 'https://meu.inss.gov.br/',
      description: null,
      category: 'Governo',
      position: 0,
      isActive: true,
    };
    server.use(
      ...sessionHandlers([], { hasEmployeeRecord: true }),
      http.get(`${API}/me/benefits`, () => HttpResponse.json([benefit])),
      http.get(`${API}/me/useful-links`, () => HttpResponse.json([link])),
    );
    renderApp('/beneficios');
    expect(await screen.findByRole('heading', { name: 'Vale-transporte' })).toBeInTheDocument();
    expect(screen.getByText('Crédito no cartão de transporte.')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s220,00/).length).toBeGreaterThan(0);
    const inss = await screen.findByRole('link', { name: /Meu INSS/ });
    expect(inss).toHaveAttribute('href', 'https://meu.inss.gov.br/');
    expect(inss).toHaveAttribute('target', '_blank');
  });
});

describe('Folha de pagamento (RH)', () => {
  it('avisa o que falta revisar e exporta o CSV para a contabilidade', async () => {
    const period: PayrollPeriodDetail = {
      id: '01900000-0000-7000-8000-000000000a09',
      month: '2026-08',
      status: 'draft',
      cutoffDate: '2026-08-31',
      employees: 1,
      generatedAt: '2026-09-02T12:00:00.000Z',
      automatic: false,
      publishedAt: null,
      closedAt: null,
      items: [
        {
          employee: { ...EMPLOYEE, cpf: '10000000442' },
          unit: 'Matriz',
          department: null,
          position: 'Vigilante',
          hireDate: '2023-05-15',
          terminationDate: null,
          baseSalary: null,
          plannedMinutes: 9600,
          workedMinutes: 9500,
          balanceMinutes: -100,
          absenceDays: 1,
          justifiedDays: 0,
          incompleteDays: 0,
          pendingAdjustments: 2,
          benefits: [],
          benefitsCompanyTotal: 0,
          benefitsDiscountTotal: 0,
          shiftPay: { lines: [], shifts: 0, total: 0 },
          dailyBenefits: { food: null, transport: null, total: 0 },
        },
      ],
    };
    let exported = false;
    server.use(
      ...sessionHandlers(['payroll:manage']),
      http.get(`${API}/payroll-periods/:id`, () => HttpResponse.json(period)),
      http.get(`${API}/payroll-periods/:id/export`, () => {
        exported = true;
        return new HttpResponse('Competência 2026-08', {
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );
    // O jsdom não baixa arquivos: basta conferir que o arquivo foi montado.
    const createObjectURL = vi.fn(() => 'blob:csv');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    renderApp(`/gestao/folha/${period.id}`);

    expect(await screen.findByText('Revise antes de fechar:')).toBeInTheDocument();
    expect(screen.getByText(/sem salário base no cargo/)).toBeInTheDocument();
    expect(screen.getByText(/2 ajuste\(s\) de ponto ainda sem decisão/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exportar para a contabilidade (CSV)' }));
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(exported).toBe(true);
  });
});
