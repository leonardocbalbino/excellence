import type { UserWithRoles } from '@excellence/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers, TEST_USER } from '@/test/server';

const users: UserWithRoles[] = [
  {
    id: TEST_USER.id,
    name: TEST_USER.name,
    email: TEST_USER.email,
    isActive: true,
    mfaEnabled: true,
    roles: [],
  },
  {
    id: '01900000-0000-7000-8000-000000000104',
    name: 'Fábio Funcionário',
    email: 'funcionario@exemplo.com.br',
    isActive: true,
    mfaEnabled: true,
    roles: [],
  },
  {
    id: '01900000-0000-7000-8000-000000000103',
    name: 'Gabriela Gestora',
    email: 'gestor@exemplo.com.br',
    isActive: true,
    mfaEnabled: false,
    roles: [],
  },
];

describe('Redefinir MFA', () => {
  it('RH redefine o MFA de outro usuário; não aparece para si nem para quem não tem MFA', async () => {
    let resetId: string | null = null;
    server.use(
      ...sessionHandlers(['users:read', 'users:reset_mfa']),
      http.get(`${API}/users`, () => HttpResponse.json(users)),
      http.post(`${API}/users/:id/mfa/reset`, ({ params }) => {
        resetId = String(params.id);
        return HttpResponse.json({ ...users[1], mfaEnabled: false }, { status: 201 });
      }),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderApp('/acesso/usuarios');

    const fabio = await screen.findByRole('button', { name: 'Redefinir MFA de Fábio Funcionário' });
    expect(
      screen.queryByRole('button', { name: `Redefinir MFA de ${TEST_USER.name}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Redefinir MFA de Gabriela Gestora' }),
    ).not.toBeInTheDocument();
    // Sem users:manage, não há edição de perfis.
    expect(screen.queryByRole('button', { name: /Editar perfis/ })).not.toBeInTheDocument();

    await user.click(fabio);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Confirme a identidade'));
    await vi.waitFor(() => expect(resetId).toBe(users[1]?.id));
    expect(await screen.findByText(/MFA de Fábio Funcionário redefinido/)).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('sem users:reset_mfa, não há botão de redefinir', async () => {
    server.use(
      ...sessionHandlers(['users:read']),
      http.get(`${API}/users`, () => HttpResponse.json(users)),
    );
    renderApp('/acesso/usuarios');
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('Fábio Funcionário')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Redefinir MFA/ })).not.toBeInTheDocument();
  });
});
