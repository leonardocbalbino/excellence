import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server } from '@/test/server';

describe('Esqueci minha senha', () => {
  it('do login, pede o link por e-mail', async () => {
    let sent: unknown;
    server.use(
      http.post(`${API}/auth/password/forgot`, async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/login');

    await user.click(await screen.findByRole('link', { name: 'Esqueci minha senha' }));
    await screen.findByRole('heading', { name: 'Esqueci minha senha' });
    await user.type(screen.getByLabelText('E-mail'), 'Ana@Empresa.com.br');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(
      await screen.findByRole('heading', { name: 'Confira o seu e-mail' }),
    ).toBeInTheDocument();
    expect(sent).toEqual({ email: 'ana@empresa.com.br' });
  });

  it('pelo link do e-mail, cria a senha nova', async () => {
    let sent: unknown;
    server.use(
      http.post(`${API}/auth/password/reset`, async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const token = 'a'.repeat(43);
    renderApp(`/redefinir-senha?token=${token}`);

    await user.type(await screen.findByLabelText('Senha nova'), 'senha-nova-123');
    await user.type(screen.getByLabelText('Repita a senha nova'), 'outra-senha');
    await user.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    expect(await screen.findByText('As senhas não são iguais')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Repita a senha nova'));
    await user.type(screen.getByLabelText('Repita a senha nova'), 'senha-nova-123');
    await user.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    expect(await screen.findByRole('heading', { name: 'Senha criada' })).toBeInTheDocument();
    expect(sent).toEqual({ token, newPassword: 'senha-nova-123' });
  });

  it('link vencido mostra o motivo e o caminho para pedir outro', async () => {
    server.use(
      http.post(`${API}/auth/password/reset`, () =>
        HttpResponse.json(
          {
            type: 'urn:excellence:problem:invalid-reference',
            title: 'Bad Request',
            status: 400,
            detail: 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".',
            errors: [{ path: 'token', message: 'Link expirado ou já usado' }],
          },
          { status: 400, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp(`/redefinir-senha?token=${'b'.repeat(43)}`);
    await user.type(await screen.findByLabelText('Senha nova'), 'senha-nova-123');
    await user.type(screen.getByLabelText('Repita a senha nova'), 'senha-nova-123');
    await user.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
    expect(await screen.findByText(/Este link expirou/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir um link novo' })).toHaveAttribute(
      'href',
      '/esqueci-senha',
    );
  });
});
