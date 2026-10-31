import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, problem, server, sessionHandlers } from '@/test/server';
import { visibleManagementNav } from './navigation';

/** Respostas vazias para as consultas da tela inicial do funcionário. */
function personalHomeHandlers() {
  return [
    http.get(`${API}/me/time-entries`, () => HttpResponse.json([])),
    http.get(`${API}/me/planned-schedule`, () => HttpResponse.json([])),
    http.get(`${API}/me/time-adjustments`, () => HttpResponse.json([])),
    http.get(`${API}/me/medical-certificates`, () => HttpResponse.json([])),
    http.get(`${API}/me/timesheet`, () => problem(404, 'urn:excellence:problem:not-found')),
    http.get(`${API}/me/employee`, () => problem(404, 'urn:excellence:problem:not-found')),
  ];
}

describe('Rotas e menu por permissão', () => {
  it('o menu mostra só o que o perfil permite', async () => {
    server.use(...sessionHandlers(['roles:read']));
    renderApp('/acesso/perfis');
    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(await within(nav).findByRole('link', { name: 'Perfis de acesso' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Auditoria' })).not.toBeInTheDocument();
  });

  it('rota sem permissão mostra acesso negado', async () => {
    server.use(...sessionHandlers([]));
    renderApp('/auditoria');
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
  });

  it('rota permitida carrega a página (sob demanda)', async () => {
    server.use(
      ...sessionHandlers(['roles:read']),
      http.get(`${API}/roles`, () => HttpResponse.json([])),
    );
    renderApp('/acesso/perfis');
    expect(await screen.findByRole('heading', { name: 'Perfis de acesso' })).toBeInTheDocument();
    // Sem roles:manage, não aparece o botão de criar.
    expect(screen.queryByRole('link', { name: 'Novo perfil' })).not.toBeInTheDocument();
  });

  it('MFA exigido e pendente leva à página de segurança', async () => {
    server.use(
      ...sessionHandlers(['roles:read'], { mfaSetupRequired: true }),
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({
          id: '01900000-0000-7000-8000-000000000101',
          companyId: '01900000-0000-7000-8000-000000000001',
          name: 'Ana',
          email: 'a@b.com',
          mfaEnabled: false,
        }),
      ),
      http.post(`${API}/auth/mfa/setup`, () =>
        HttpResponse.json({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
        }),
      ),
    );
    const { router } = renderApp('/acesso/perfis');
    expect(
      await screen.findByText(/Seu perfil exige verificação em duas etapas/),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/conta/seguranca');
  });

  it('endereço desconhecido mostra página não encontrada', async () => {
    server.use(...sessionHandlers([]));
    renderApp('/nao-existe');
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
  });
});

describe('Área pessoal e área de gestão', () => {
  it('administrador sem cadastro de funcionário vai direto para a visão geral, sem ponto', async () => {
    server.use(...sessionHandlers(['roles:read', 'audit:read']));
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/gestao');
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).queryByRole('link', { name: 'Registrar ponto' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Escala' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Meu espaço' })).not.toBeInTheDocument();
    // Comunicados para toda a empresa também chegam a quem não tem cadastro.
    expect(screen.getByRole('link', { name: 'Comunicados recebidos' })).toBeInTheDocument();
  });

  it('sem cadastro de funcionário, a área pessoal explica que não há ponto próprio', async () => {
    server.use(...sessionHandlers(['roles:read']));
    renderApp('/ponto');
    expect(
      await screen.findByRole('heading', { name: 'Sem cadastro de funcionário' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para a visão geral' })).toBeInTheDocument();
  });

  it('gestor que bate ponto: início pessoal, gestão separada', async () => {
    server.use(
      ...sessionHandlers(['time_adjustments:approve'], { hasEmployeeRecord: true }),
      ...personalHomeHandlers(),
      http.get(`${API}/time-adjustments`, () => HttpResponse.json([])),
    );
    const { router } = renderApp('/');

    // Área pessoal: o próprio ponto, sem os itens de gestão no menu.
    expect(await screen.findByRole('heading', { name: /Olá, Ana/ })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getByRole('link', { name: 'Registrar ponto' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Ajustes de ponto' })).not.toBeInTheDocument();

    // Troca de área explícita.
    screen.getAllByRole('link', { name: 'Área de gestão' })[0]?.click();
    await waitFor(() => expect(router.state.location.pathname).toBe('/gestao'));
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    const managementNav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(
      within(managementNav).getByRole('link', { name: 'Ajustes de ponto' }),
    ).toBeInTheDocument();
    expect(
      within(managementNav).queryByRole('link', { name: 'Registrar ponto' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meu espaço' })).toBeInTheDocument();
  });

  it('funcionário sem gestão não vê a troca de área', async () => {
    server.use(...sessionHandlers([], { hasEmployeeRecord: true }), ...personalHomeHandlers());
    renderApp('/');
    expect(await screen.findByRole('heading', { name: /Olá, Ana/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Área de gestão' })).not.toBeInTheDocument();
  });
});

describe('visibleManagementNav', () => {
  it('filtra pelos itens permitidos e só inclui a visão geral quando há gestão', () => {
    expect(visibleManagementNav([])).toEqual([]);
    const sections = visibleManagementNav(['audit:read']);
    expect(sections.flatMap((s) => s.items.map((i) => i.label))).toEqual([
      'Visão geral',
      'Auditoria',
    ]);
  });
});
