import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { uploadFile } from '@/lib/upload';
import { API, server, sessionHandlers, TEST_USER } from '@/test/server';

// O fetch do Node não aceita o FormData/File do jsdom: o envio direto ao storage é coberto
// pelo e2e (navegador real + MinIO). Aqui o upload é simulado.
vi.mock('@/lib/upload', () => ({
  uploadFile: vi.fn(() => Promise.resolve('01900000-0000-7000-8000-00000000f001')),
}));

const UNIT = { id: '01900000-0000-7000-8000-000000000301', name: 'Matriz' };

function employee(overrides: Record<string, unknown> = {}) {
  return {
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
    unit: UNIT,
    department: null,
    position: { id: '01900000-0000-7000-8000-000000000501', name: 'Vigilante' },
    union: null,
    manager: null,
    userId: null,
    ...overrides,
  };
}

describe('Funcionários', () => {
  it('lista com busca, nome social e CPF formatado', async () => {
    const queries: string[] = [];
    server.use(
      ...sessionHandlers(['employees:read']),
      http.get(`${API}/employees`, ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({
          items: [
            employee(),
            employee({
              id: '01900000-0000-7000-8000-000000000705',
              name: 'Carla',
              socialName: 'Cacá',
              cpf: '10000000500',
            }),
          ],
          total: 2,
          page: 1,
          pageSize: 25,
        });
      }),
    );
    renderApp('/pessoas');
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('100.000.004-42')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Cacá' })).toBeInTheDocument();
    // Sem employees:manage/import, sem botões de cadastro.
    expect(screen.queryByRole('link', { name: 'Novo funcionário' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar'), 'fab');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(queries.at(-1)).toContain('search=fab'));
  });

  it('cria a conta de acesso e mostra a senha temporária uma vez', async () => {
    server.use(
      ...sessionHandlers(['employees:read', 'employees:manage']),
      http.get(`${API}/employees/:id`, () => HttpResponse.json(employee())),
      http.get(`${API}/units`, () => HttpResponse.json([])),
      http.get(`${API}/departments`, () => HttpResponse.json([])),
      http.get(`${API}/positions`, () => HttpResponse.json([])),
      http.get(`${API}/unions`, () => HttpResponse.json([])),
      http.get(`${API}/employees`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 }),
      ),
      http.post(`${API}/employees/:id/account`, () =>
        HttpResponse.json(
          {
            userId: TEST_USER.id,
            email: 'fabio@exemplo.com.br',
            temporaryPassword: 'Kx7mPq2vRt9w',
          },
          { status: 201 },
        ),
      ),
    );
    renderApp(`/pessoas/${employee().id}?aba=acesso`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('E-mail de login'), 'fabio@exemplo.com.br');
    await user.click(screen.getByRole('button', { name: 'Criar acesso' }));
    expect(await screen.findByText('Kx7mPq2vRt9w')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('não será exibida de novo');
  });
});

describe('Cadastro de funcionário', () => {
  it('preserva o gestor atual ao salvar, mesmo fora da lista de opções', async () => {
    const manager = { id: '01900000-0000-7000-8000-000000000703', name: 'Gabriela Gestora' };
    let sent: Record<string, unknown> | undefined;
    server.use(
      ...sessionHandlers(['employees:read', 'employees:manage']),
      http.get(`${API}/employees/:id`, () => HttpResponse.json(employee({ manager }))),
      http.get(`${API}/units`, () =>
        HttpResponse.json([
          {
            ...UNIT,
            code: null,
            cnpj: null,
            street: null,
            number: null,
            complement: null,
            district: null,
            city: null,
            state: null,
            postalCode: null,
            latitude: null,
            longitude: null,
            geofenceRadiusMeters: null,
            timezone: null,
            isActive: true,
          },
        ]),
      ),
      http.get(`${API}/departments`, () => HttpResponse.json([])),
      http.get(`${API}/positions`, () =>
        HttpResponse.json([
          {
            id: '01900000-0000-7000-8000-000000000501',
            name: 'Vigilante',
            cbo: null,
            baseSalary: null,
            isActive: true,
          },
        ]),
      ),
      http.get(`${API}/unions`, () => HttpResponse.json([])),
      // Lista de gestores possíveis sem a Gabriela.
      http.get(`${API}/employees`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 }),
      ),
      http.put(`${API}/employees/:id`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(employee({ manager }));
      }),
    );
    renderApp(`/pessoas/${employee().id}`);
    const select = await screen.findByLabelText('Gestor direto');
    expect(select).toHaveValue(manager.id);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Salvar cadastro' }));
    await waitFor(() => expect(sent).toMatchObject({ managerId: manager.id, unitId: UNIT.id }));
  });
});

describe('Importação', () => {
  function importHandlers(report: Record<string, unknown>) {
    const calls: unknown[] = [];
    server.use(
      ...sessionHandlers(['employees:read', 'employees:import']),
      http.post(`${API}/employees/imports`, async ({ request }) => {
        const body = (await request.json()) as { dryRun: boolean };
        calls.push(body);
        return HttpResponse.json(
          body.dryRun ? report : { ...report, imported: report.validRows, dryRun: false },
          { status: 201 },
        );
      }),
    );
    return calls;
  }

  async function sendFile() {
    const user = userEvent.setup();
    const file = new File(['matricula;nome\n1;Ana\n'], 'funcionarios.csv', { type: 'text/csv' });
    await user.upload(await screen.findByLabelText('Planilha'), file);
    await user.click(screen.getByRole('button', { name: 'Conferir planilha' }));
    return user;
  }

  it('mostra os erros linha a linha e não oferece importar', async () => {
    importHandlers({
      totalRows: 2,
      validRows: 1,
      imported: 0,
      dryRun: true,
      errors: [{ row: 3, column: 'cpf', message: 'CPF inválido' }],
    });
    renderApp('/pessoas/importar');
    await sendFile();
    expect(await screen.findByRole('cell', { name: 'CPF inválido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Importar/ })).not.toBeInTheDocument();
  });

  it('confere, depois importa com o mesmo arquivo', async () => {
    const calls = importHandlers({
      totalRows: 3,
      validRows: 3,
      imported: 0,
      dryRun: true,
      errors: [],
    });
    renderApp('/pessoas/importar');
    const user = await sendFile();
    await user.click(await screen.findByRole('button', { name: 'Importar 3 funcionários' }));
    // A mensagem aparece no resultado (e no toast); o link só existe no resultado.
    expect(await screen.findByRole('link', { name: 'Ver funcionários' })).toBeInTheDocument();
    expect(uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(File),
      'spreadsheet_import',
    );
    expect(calls).toEqual([
      { fileId: '01900000-0000-7000-8000-00000000f001', dryRun: true },
      { fileId: '01900000-0000-7000-8000-00000000f001', dryRun: false },
    ]);
  });
});

describe('Senha temporária', () => {
  it('leva à troca de senha e valida a confirmação', async () => {
    let changed: unknown;
    server.use(
      ...sessionHandlers(['employees:read'], { passwordChangeRequired: true }),
      http.post(`${API}/auth/password`, async ({ request }) => {
        changed = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderApp('/pessoas');
    expect(await screen.findByText(/senha temporária/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/conta/senha');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Senha temporária'), 'Kx7mPq2vRt9w');
    await user.type(screen.getByLabelText('Nova senha'), 'Minha-senha-nova-1');
    await user.type(screen.getByLabelText('Repita a nova senha'), 'Outra-coisa');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect(await screen.findByText('As senhas não conferem')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Repita a nova senha'));
    await user.type(screen.getByLabelText('Repita a nova senha'), 'Minha-senha-nova-1');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await waitFor(() =>
      expect(changed).toEqual({
        currentPassword: 'Kx7mPq2vRt9w',
        newPassword: 'Minha-senha-nova-1',
      }),
    );
  });
});
