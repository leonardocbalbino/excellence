import type { Shift, Unit } from '@excellence/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const UNIT_ID = '01900000-0000-7000-8000-000000000a01';

const unit: Unit = {
  id: UNIT_ID,
  name: 'Reserva Lagoa',
  code: null,
  cnpj: null,
  street: null,
  number: null,
  complement: null,
  district: null,
  city: 'São Luís',
  state: 'MA',
  postalCode: null,
  latitude: null,
  longitude: null,
  geofenceRadiusMeters: null,
  timezone: null,
  occurrenceEmails: [],
  isActive: true,
};

const shift = (id: string, name: string, owner: Unit | null): Shift => ({
  id,
  unit: owner ? { id: owner.id, name: owner.name } : null,
  name,
  code: null,
  start: '07:00',
  end: '19:00',
  crossesMidnight: false,
  breakMinutes: 60,
  workMinutes: 660,
  isActive: true,
});

function handlers() {
  return [
    ...sessionHandlers(['units:read', 'schedules:read', 'schedules:manage']),
    http.get(`${API}/units`, () => HttpResponse.json([unit])),
    http.get(`${API}/units/${UNIT_ID}`, () => HttpResponse.json(unit)),
    http.get(`${API}/work-schedules`, () => HttpResponse.json([])),
    http.get(`${API}/shifts`, () =>
      HttpResponse.json([
        shift('01900000-0000-7000-8000-000000000901', 'Diurno do posto', unit),
        shift('01900000-0000-7000-8000-000000000902', 'Comercial', null),
      ]),
    ),
  ];
}

describe('Menus de fora: visão consolidada, cadastro na pasta do posto', () => {
  it('Nova escala pede o posto e abre a aba de escalas da pasta dele', async () => {
    server.use(...handlers());
    const user = userEvent.setup();
    renderApp('/jornada/escalas');

    expect(await screen.findByText(/Visão consolidada de todos os postos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Nova escala/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Geral/ })).toBeInTheDocument();
    await user.click(within(menu).getByRole('menuitem', { name: /Reserva Lagoa/ }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reserva Lagoa' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Escalas e turnos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('turno de posto abre a pasta; o geral continua editável aqui', async () => {
    server.use(...handlers());
    renderApp('/jornada/turnos');

    const link = await screen.findByRole('link', { name: /Abrir pasta de Diurno do posto/ });
    expect(link).toHaveAttribute('href', `/cadastros/postos/${UNIT_ID}?aba=escalas`);
    expect(screen.getByRole('button', { name: 'Editar Comercial' })).toBeInTheDocument();
  });
});
