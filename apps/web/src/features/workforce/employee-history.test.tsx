import type { Employee, EmployeeHistoryEvent } from '@excellence/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const employee: Employee = {
  id: '01900000-0000-7000-8000-000000000704',
  registrationNumber: '0004',
  name: 'Fábio Funcionário',
  socialName: null,
  cpf: '10000000442',
  pis: null,
  birthDate: null,
  email: null,
  phone: null,
  hireDate: '2023-05-15',
  terminationDate: null,
  status: 'active',
  unit: { id: '01900000-0000-7000-8000-000000000301', name: 'Matriz — São Luís' },
  department: null,
  position: { id: '01900000-0000-7000-8000-000000000501', name: 'Vigilante' },
  union: null,
  manager: null,
  userId: null,
};

const history: EmployeeHistoryEvent[] = [
  {
    id: 'a1',
    at: '2026-09-20T15:00:00.000Z',
    dateOnly: false,
    kind: 'record_updated',
    title: 'Cadastro alterado',
    description: null,
    actor: { id: '01900000-0000-7000-8000-000000000102', name: 'Rafael do RH' },
    changes: [{ label: 'Posto de trabalho', before: 'Matriz — São Luís', after: 'Posto Anil' }],
  },
  {
    id: 'c1',
    at: '2026-09-10T12:00:00.000Z',
    dateOnly: false,
    kind: 'certificate_submitted',
    title: 'Atestado enviado',
    description: '10/09/2026',
    actor: null,
    changes: [],
  },
  {
    id: 'hired',
    at: '2023-05-15T12:00:00.000Z',
    dateOnly: true,
    kind: 'hired',
    title: 'Admissão',
    description: 'Vigilante · Matriz — São Luís',
    actor: null,
    changes: [],
  },
];

describe('Histórico do funcionário', () => {
  it('abre pela aba no endereço, mostra quem mudou o quê e filtra por assunto', async () => {
    server.use(
      ...sessionHandlers(['employees:read']),
      http.get(`${API}/employees/:id`, () => HttpResponse.json(employee)),
      http.get(`${API}/employees/:id/history`, () => HttpResponse.json(history)),
    );
    const user = userEvent.setup();
    renderApp(`/pessoas/${employee.id}?aba=historico`);

    expect(await screen.findByText('Cadastro alterado')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Histórico' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/por Rafael do RH/)).toBeInTheDocument();
    expect(screen.getByText('Posto Anil')).toBeInTheDocument();
    expect(screen.getByText('15/05/2023')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Atestados' }));
    expect(screen.getByText('Atestado enviado')).toBeInTheDocument();
    expect(screen.queryByText('Cadastro alterado')).not.toBeInTheDocument();
    // Sem eventos de benefício, o filtro nem aparece.
    expect(screen.queryByRole('button', { name: 'Benefícios' })).not.toBeInTheDocument();
  });

  it('perfil sem employees:manage vê o aviso de só consulta nos dados', async () => {
    server.use(
      ...sessionHandlers(['employees:read']),
      http.get(`${API}/employees/:id`, () => HttpResponse.json(employee)),
      http.get(`${API}/units`, () => HttpResponse.json([])),
      http.get(`${API}/departments`, () => HttpResponse.json([])),
      http.get(`${API}/positions`, () => HttpResponse.json([])),
      http.get(`${API}/unions`, () => HttpResponse.json([])),
      http.get(`${API}/employees`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 }),
      ),
    );
    renderApp(`/pessoas/${employee.id}`);
    expect(
      await screen.findByText('Seu perfil só consulta o cadastro. Alterações são feitas pelo RH.'),
    ).toBeInTheDocument();
  });
});
