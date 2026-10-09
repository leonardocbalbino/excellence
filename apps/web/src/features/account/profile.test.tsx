import type { Employee } from '@excellence/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers, TEST_USER } from '@/test/server';

const employee: Employee = {
  id: '01900000-0000-7000-8000-000000000704',
  registrationNumber: '0004',
  name: 'Fábio Funcionário',
  socialName: null,
  cpf: '10000000442',
  pis: '12056412547',
  birthDate: '1990-04-12',
  email: 'fabio@exemplo.com.br',
  phone: '98999998888',
  hireDate: '2023-05-15',
  terminationDate: null,
  status: 'active',
  unit: { id: '01900000-0000-7000-8000-000000000301', name: 'Matriz — São Luís' },
  department: { id: '01900000-0000-7000-8000-000000000401', name: 'Operações' },
  position: { id: '01900000-0000-7000-8000-000000000501', name: 'Vigilante' },
  union: null,
  manager: { id: '01900000-0000-7000-8000-000000000703', name: 'Gabriela Gestora' },
  userId: TEST_USER.id,
};

describe('Meu perfil', () => {
  it('mostra os dados do cadastro e da conta, só para leitura', async () => {
    server.use(
      ...sessionHandlers([], { hasEmployeeRecord: true }),
      http.get(`${API}/auth/me`, () => HttpResponse.json(TEST_USER)),
      http.get(`${API}/me/employee`, () => HttpResponse.json(employee)),
    );
    renderApp('/perfil');
    expect(await screen.findByText('100.000.004-42')).toBeInTheDocument();
    expect(screen.getByText('(98) 99999-8888')).toBeInTheDocument();
    expect(screen.getByText('Gabriela Gestora')).toBeInTheDocument();
    expect(screen.getByText('15/05/2023')).toBeInTheDocument();
    expect(screen.getByText(/Fale com o RH/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trocar senha' })).toHaveAttribute(
      'href',
      '/conta/senha',
    );
    // Preferências: o tema também fica no perfil.
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeInTheDocument();
    // Sem campos de texto editáveis: o cadastro é do RH.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('sem cadastro de funcionário, mostra só a conta de acesso', async () => {
    server.use(
      ...sessionHandlers(['roles:read']),
      http.get(`${API}/auth/me`, () => HttpResponse.json(TEST_USER)),
    );
    renderApp('/perfil');
    expect(await screen.findByText(/não está ligado a um cadastro/)).toBeInTheDocument();
    const account = screen.getByRole('region', { name: 'Conta de acesso' });
    expect(within(account).getByText(TEST_USER.email)).toBeInTheDocument();
    expect(screen.queryByText('Dados pessoais')).not.toBeInTheDocument();
  });

  it('na gestão, perfil, tema, segurança e sair ficam no menu da conta', async () => {
    server.use(
      ...sessionHandlers(['roles:read']),
      http.get(`${API}/auth/me`, () => HttpResponse.json(TEST_USER)),
    );
    const user = userEvent.setup();
    renderApp('/perfil');
    await screen.findByRole('heading', { name: 'Meu perfil' });
    // O menu lateral não tem mais esses itens soltos.
    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).queryByText('Sair')).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole('radio', { name: 'Escuro' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Conta de ${TEST_USER.name}` }));
    expect(await screen.findByRole('menuitem', { name: 'Meu perfil' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Escuro' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Segurança da conta' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeInTheDocument();
  });
});
