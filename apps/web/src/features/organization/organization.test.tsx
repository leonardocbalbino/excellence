import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

describe('Postos de trabalho', () => {
  it('preenche coordenadas pelo GPS e valida a cerca virtual antes de enviar', async () => {
    let sent: unknown;
    server.use(
      ...sessionHandlers(['units:read', 'units:manage']),
      http.post(`${API}/units`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          { ...(sent as object), id: '01900000-0000-7000-8000-000000000399' },
          { status: 201 },
        );
      }),
      http.get(`${API}/units/:id`, () => HttpResponse.json({})),
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            timestamp: Date.now(),
            coords: { latitude: -2.5495623, longitude: -44.2393983, accuracy: 8 },
          } as GeolocationPosition),
      },
    });

    renderApp('/cadastros/postos/novo');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nome'), 'Posto Anil');
    // Raio sem coordenadas: a validação compartilhada recusa.
    await user.type(screen.getByLabelText('Raio (metros)'), '150');
    await user.click(screen.getByRole('button', { name: 'Salvar posto' }));
    expect(
      await screen.findByText('A cerca virtual exige as coordenadas do posto'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Usar minha localização atual' }));
    await waitFor(() => expect(screen.getByLabelText('Latitude')).toHaveValue('-2.549562'));
    await user.click(screen.getByRole('button', { name: 'Salvar posto' }));
    await waitFor(() =>
      expect(sent).toMatchObject({
        name: 'Posto Anil',
        latitude: -2.549562,
        longitude: -44.239398,
        geofenceRadiusMeters: 150,
      }),
    );
  });
});

describe('Cadastros simples', () => {
  it('cargos: lista, cria e mostra erro de campo vindo da API', async () => {
    server.use(
      ...sessionHandlers(['positions:read', 'positions:manage']),
      http.get(`${API}/positions`, () =>
        HttpResponse.json([
          {
            id: '01900000-0000-7000-8000-000000000501',
            name: 'Vigilante',
            cbo: '517330',
            baseSalary: null,
            isActive: true,
          },
        ]),
      ),
      http.post(`${API}/positions`, () =>
        HttpResponse.json(
          {
            type: 'urn:excellence:problem:unique-violation',
            title: 'Conflict',
            status: 409,
            detail: 'Já existe um cargo com este nome.',
            errors: [{ path: 'name', message: 'Já existe um cargo com este nome.' }],
          },
          { status: 409 },
        ),
      ),
    );
    renderApp('/cadastros/cargos');
    expect(await screen.findByRole('cell', { name: '517330' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Novo cargo' }));
    await user.type(screen.getByLabelText('Nome'), 'Vigilante');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findAllByText('Já existe um cargo com este nome.')).not.toHaveLength(0);
  });
});
