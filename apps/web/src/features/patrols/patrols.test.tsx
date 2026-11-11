import type { MyPatrols, PatrolBoard, PatrolRun } from '@excellence/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const ROUTE = { id: '01900000-0000-7000-8000-000000000b01', name: 'Perímetro' };
const UNIT = { id: '01900000-0000-7000-8000-000000000301', name: 'Matriz' };
const POINTS = [
  { id: '01900000-0000-7000-8000-000000000a01', name: 'Portão' },
  { id: '01900000-0000-7000-8000-000000000a02', name: 'Galpão' },
];

function run(checked: number, overrides: Partial<PatrolRun> = {}): PatrolRun {
  return {
    id: '01900000-0000-7000-8000-000000000c01',
    route: ROUTE,
    unit: UNIT,
    employee: { id: '01900000-0000-7000-8000-000000000704', name: 'Fábio Funcionário' },
    timezone: 'America/Sao_Paulo',
    scheduledFor: '2026-09-28T22:00:00.000Z',
    startedAt: '2026-09-28T22:02:00.000Z',
    expectedEndAt: '2026-09-28T22:42:00.000Z',
    finishedAt: null,
    status: 'in_progress',
    finishNote: null,
    enforceOrder: false,
    points: POINTS.map((p, i) => ({
      ...p,
      checkin:
        i < checked
          ? {
              id: `01900000-0000-7000-8000-00000000d00${String(i)}`,
              recordedAt: '2026-09-28T22:05:00.000Z',
              localTime: '19:05',
              geofenceStatus: 'no_fence' as const,
              distanceMeters: null,
              outOfOrder: false,
              offline: false,
            }
          : null,
    })),
    checked,
    total: POINTS.length,
    required: POINTS.length,
    lateMinutes: 0,
    nextPoint: POINTS[checked] ?? null,
    photos: [],
    ...overrides,
  };
}

const MINE: MyPatrols = {
  routes: [
    {
      id: ROUTE.id,
      name: ROUTE.name,
      unit: UNIT,
      expectedMinutes: 40,
      pointsCount: 2,
      slots: [
        {
          route: ROUTE,
          unit: UNIT,
          at: '2026-09-28T22:00:00.000Z',
          localTime: '19:00',
          status: 'upcoming',
          runId: null,
        },
      ],
    },
  ],
  current: null,
};

describe('Rondas: área pessoal', () => {
  it('"Rondas" só aparece no menu de quem tem rota atribuída', async () => {
    server.use(
      ...sessionHandlers([], { hasEmployeeRecord: true, hasPatrolRoutes: false }),
      http.get(`${API}/me/patrols`, () => HttpResponse.json(MINE)),
    );
    renderApp('/rondas');
    // A página continua acessível (mostra que não há rota), mas sem item no menu.
    await screen.findByRole('heading', { name: 'Rondas' });
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).queryByRole('link', { name: 'Rondas' })).not.toBeInTheDocument();
  });

  it('inicia a ronda e registra o ponto digitando o código quando não há câmera', async () => {
    let checkinBody: unknown;
    let idempotencyKey: string | null = null;
    // Como na API: depois de iniciar, o mural traz a ronda em andamento.
    let current: PatrolRun | null = null;
    server.use(
      ...sessionHandlers([], { hasEmployeeRecord: true, hasPatrolRoutes: true }),
      http.get(`${API}/me/patrols`, () => HttpResponse.json({ ...MINE, current })),
      http.post(`${API}/me/patrol-runs`, () => {
        current = run(0);
        return HttpResponse.json(current, { status: 201 });
      }),
      http.post(`${API}/me/patrol-runs/:id/checkins`, async ({ request }) => {
        checkinBody = await request.json();
        idempotencyKey = request.headers.get('Idempotency-Key');
        current = run(1);
        return HttpResponse.json(current, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/rondas');

    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(await within(nav).findByRole('link', { name: 'Rondas' })).toBeInTheDocument();
    expect(await screen.findByText('Próxima: 19:00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Iniciar e ler QR code' }));

    // Ronda em andamento: sem câmera no jsdom, cai na digitação do código.
    expect(await screen.findByText(/Próximo ponto:/)).toHaveTextContent('Portão');
    await user.type(await screen.findByLabelText('Código do ponto'), 'EXR1.codigo-do-portao');
    await user.click(screen.getByRole('button', { name: 'Registrar ponto' }));

    expect(await screen.findByText('1 de 2 pontos')).toBeInTheDocument();
    expect(checkinBody).toMatchObject({ code: 'EXR1.codigo-do-portao' });
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    // Concluir faltando pontos exige o motivo.
    expect(screen.getByRole('button', { name: 'Concluir ronda' })).toBeDisabled();
  });

  it('o último ponto não encerra: quem fez conclui com comentário', async () => {
    let finishBody: unknown;
    let current: PatrolRun | null = run(1);
    server.use(
      ...sessionHandlers([], { hasEmployeeRecord: true, hasPatrolRoutes: true }),
      http.get(`${API}/me/patrols`, () => HttpResponse.json({ ...MINE, current })),
      http.post(`${API}/me/patrol-runs/:id/checkins`, () => {
        current = run(2);
        return HttpResponse.json(current, { status: 201 });
      }),
      http.post(`${API}/me/patrol-runs/:id/finish`, async ({ request }) => {
        finishBody = await request.json();
        const done = run(2, {
          status: 'completed',
          finishedAt: '2026-09-28T22:30:00.000Z',
          finishNote: 'Tudo em ordem.',
        });
        current = null;
        return HttpResponse.json(done, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/rondas');

    await user.type(await screen.findByLabelText('Código do ponto'), 'EXR1.codigo-do-galpao');
    await user.click(screen.getByRole('button', { name: 'Registrar ponto' }));
    expect(await screen.findByText('2 de 2 pontos')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Comentário (opcional)'), 'Tudo em ordem.');
    await user.click(screen.getByRole('button', { name: 'Concluir ronda' }));
    await screen.findByRole('button', { name: 'Iniciar e ler QR code' });
    expect(finishBody).toEqual({ note: 'Tudo em ordem.' });
  });
});

describe('Rondas: gestão', () => {
  it('quadro do dia mostra a ronda atrasada e o horário não iniciado', async () => {
    const board: PatrolBoard = {
      date: '2026-09-28',
      runs: [run(1, { lateMinutes: 12 })],
      slots: [
        {
          route: ROUTE,
          unit: UNIT,
          at: '2026-09-28T22:00:00.000Z',
          localTime: '19:00',
          status: 'in_progress',
          runId: run(1).id,
        },
        {
          route: ROUTE,
          unit: UNIT,
          at: '2026-09-28T19:00:00.000Z',
          localTime: '16:00',
          status: 'missed',
          runId: null,
        },
      ],
    };
    server.use(
      ...sessionHandlers(['patrols:read']),
      http.get(`${API}/patrol-runs/board`, () => HttpResponse.json(board)),
    );
    renderApp('/gestao/rondas');
    expect(await screen.findByRole('heading', { name: 'Rondas do dia' })).toBeInTheDocument();
    expect((await screen.findAllByText('Atrasada 12 min')).length).toBeGreaterThan(0);
    expect(screen.getByText('Não iniciada')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getByRole('link', { name: 'Rondas do dia' })).toBeInTheDocument();
    // Sem patrols:manage, não aparece o cadastro de rotas e pontos.
    expect(within(nav).queryByRole('link', { name: 'Rotas' })).not.toBeInTheDocument();
  });
});
