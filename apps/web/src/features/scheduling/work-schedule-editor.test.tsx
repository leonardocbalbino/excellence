import type { Shift, WorkSchedule } from '@excellence/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const SHIFT_ID = '01900000-0000-7000-8000-000000000901';

const shift: Shift = {
  id: SHIFT_ID,
  unit: null,
  name: 'Diurno 12h',
  code: null,
  start: '07:00',
  end: '19:00',
  crossesMidnight: false,
  breakMinutes: 60,
  workMinutes: 660,
  isActive: true,
};

describe('Escala 12x36 par/ímpar', () => {
  it('escolhe ímpar: ciclo de turno e folga, mês de referência e a virada dos meses', async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      ...sessionHandlers(['schedules:read', 'schedules:manage', 'units:read']),
      http.get(`${API}/shifts`, () => HttpResponse.json([shift])),
      http.get(`${API}/units`, () => HttpResponse.json([])),
      http.post(`${API}/work-schedules`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        const created: WorkSchedule = {
          id: '01900000-0000-7000-8000-000000000b09',
          unit: null,
          name: '12x36 Ímpar',
          code: null,
          kind: 'cycle',
          cycleAnchor: 'odd',
          parityMonth: '2026-10',
          days: [SHIFT_ID, null],
          weeklyMinutes: null,
          notes: null,
          isActive: true,
          employeeCount: 0,
        };
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp('/jornada/escalas/nova');

    await user.type(await screen.findByLabelText('Nome'), '12x36 Ímpar');
    await user.selectOptions(screen.getByLabelText('O ciclo começa'), 'odd');

    // Dois dias: o turno nos dias ímpares e a folga no dia seguinte.
    expect(screen.getByLabelText('Dias ímpares')).toHaveValue(SHIFT_ID);
    expect(screen.getByLabelText('Dia seguinte')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Dia' })).not.toBeInTheDocument();

    const month = screen.getByLabelText('Mês em que trabalha nos dias ímpares');
    await user.clear(month);
    await user.type(month, '2026-10');
    expect(
      within(screen.getByRole('list', { name: 'Paridade nos próximos meses' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(6);

    await user.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => {
      expect(sent).toMatchObject({
        cycleAnchor: 'odd',
        parityMonth: '2026-10',
        days: [SHIFT_ID, null],
      });
    });
  });
});
