import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, authenticated, problem, server } from '@/test/server';
import { safeNext } from './safe-next';

function accessHandler() {
  return http.get(`${API}/me/access`, () =>
    HttpResponse.json({
      permissions: [],
      hasEmployeeRecord: false,
      hasPatrolRoutes: false,
      mfaSetupRequired: false,
      passwordChangeRequired: false,
    }),
  );
}

async function fillCredentials(email = 'admin@exemplo.com.br', password = 'segredo') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

describe('Login', () => {
  it('sem sessão, rota interna manda para o login guardando o destino', async () => {
    const { router } = renderApp('/acesso/perfis');
    await screen.findByRole('button', { name: 'Entrar' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Facesso%2Fperfis');
  });

  it('valida os campos antes de chamar a API', async () => {
    renderApp('/login');
    await fillCredentials(' ', ' ');
    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
  });

  it('mostra erro de credenciais', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        problem(401, 'urn:excellence:problem:invalid-credentials', 'E-mail ou senha inválidos.'),
      ),
    );
    renderApp('/login');
    await fillCredentials();
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it('avisa quando há muitas tentativas', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        problem(429, 'urn:excellence:problem:too-many-attempts'),
      ),
    );
    renderApp('/login');
    await fillCredentials();
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
  });

  it('entra e volta para o destino pedido', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(authenticated());
      }),
      accessHandler(),
    );
    const { router, services } = renderApp('/login?next=%2Fconta%2Fseguranca');
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(authenticated().user)));
    await fillCredentials();
    await waitFor(() => expect(router.state.location.pathname).toBe('/conta/seguranca'));
    expect(body).toEqual({ email: 'admin@exemplo.com.br', password: 'segredo', client: 'web' });
    expect(services.session.accessToken()).toBe('access-token');
  });

  it('pede o código quando o MFA está ativo', async () => {
    let authorization: string | null = null;
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ status: 'mfa_required', mfaToken: 'mfa-token', expiresIn: 300 }),
      ),
      http.post(`${API}/auth/mfa/verify`, ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json(authenticated());
      }),
      accessHandler(),
    );
    const { router } = renderApp('/login');
    const user = await fillCredentials();
    await user.type(await screen.findByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(authorization).toBe('Bearer mfa-token');
    // Sem cadastro de funcionário nem gestão: o início só orienta a falar com o RH.
    expect(await screen.findByRole('heading', { name: 'Tudo pronto' })).toBeInTheDocument();
  });
});

describe('safeNext', () => {
  it.each([
    ['/acesso/perfis', '/acesso/perfis'],
    [null, '/'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
