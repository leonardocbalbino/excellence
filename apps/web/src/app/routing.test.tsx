import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';
import { visibleNavItems } from './navigation';

describe('Rotas e menu por permissão', () => {
  it('o menu mostra só o que o perfil permite', async () => {
    server.use(...sessionHandlers(['roles:read']));
    renderApp('/');
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

describe('visibleNavItems', () => {
  it('filtra pelos itens permitidos, mantendo os livres', () => {
    expect(visibleNavItems(['audit:read']).map((i) => i.label)).toEqual(['Início', 'Auditoria']);
  });
});
