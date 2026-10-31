import type { PermissionInfo, Role } from '@excellence/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoleForm } from './role-form';

const CATALOG: PermissionInfo[] = [
  {
    key: 'roles:read',
    resource: 'roles',
    action: 'read',
    description: 'Ver perfis',
    sensitive: false,
  },
  {
    key: 'roles:manage',
    resource: 'roles',
    action: 'manage',
    description: 'Editar perfis',
    sensitive: false,
  },
  {
    key: 'audit:read',
    resource: 'audit',
    action: 'read',
    description: 'Consultar a trilha',
    sensitive: true,
  },
];

const ROLE: Role = {
  id: '01900000-0000-7000-8000-000000000201',
  name: 'Supervisor',
  description: null,
  isSystem: false,
  requiresMfa: false,
  permissions: ['roles:read'],
  scopes: [{ type: 'own_team' }, { type: 'unit', unitId: '01900000-0000-7000-8000-00000000a001' }],
  userCount: 2,
};

describe('RoleForm', () => {
  it('agrupa permissões por recurso e destaca as sensíveis', () => {
    render(<RoleForm catalog={CATALOG} readOnly={false} onSubmit={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Perfis de acesso' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Auditoria' })).toHaveTextContent('leitura auditada');
  });

  it('envia nome, permissões e escopos marcados', async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    render(<RoleForm catalog={CATALOG} readOnly={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Nome'), 'Portaria');
    await user.click(screen.getByRole('checkbox', { name: 'Ver perfis' }));
    await user.click(screen.getByRole('checkbox', { name: /Consultar a trilha/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Toda a empresa' }));
    await user.click(screen.getByRole('checkbox', { name: 'Somente os próprios dados' }));
    await user.click(screen.getByRole('checkbox', { name: /Exigir verificação/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Portaria',
      description: null,
      requiresMfa: true,
      permissions: ['roles:read', 'audit:read'],
      scopes: [{ type: 'company' }],
    });
  });

  it('exige ao menos um escopo', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RoleForm catalog={CATALOG} readOnly={false} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Nome'), 'Sem escopo');
    await user.click(screen.getByRole('checkbox', { name: 'Somente os próprios dados' }));
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));
    expect(await screen.findByText('Informe ao menos um escopo')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('preserva escopos de unidade existentes e mostra o perfil em modo leitura', () => {
    render(<RoleForm catalog={CATALOG} role={ROLE} readOnly onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Nome')).toHaveValue('Supervisor');
    expect(screen.getByLabelText('Nome')).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Equipe que gerencia' })).toBeChecked();
    expect(screen.getByText(/Também: Posto de trabalho 01900000/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar perfil' })).not.toBeInTheDocument();
  });

  it('mostra o erro da API (ex.: escalada de privilégio)', async () => {
    const { ApiError } = await import('@excellence/shared');
    const onSubmit = vi.fn(() =>
      Promise.reject(
        new ApiError({
          type: 'urn:excellence:problem:privilege-escalation',
          title: 'Forbidden',
          status: 403,
          detail: 'Você não pode conceder permissões que não possui: audit:read.',
        }),
      ),
    );
    const user = userEvent.setup();
    render(<RoleForm catalog={CATALOG} role={ROLE} readOnly={false} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('que não possui: audit:read');
  });
});
