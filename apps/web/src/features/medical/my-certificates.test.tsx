import type { MedicalCertificate } from '@excellence/shared';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const certificate: MedicalCertificate = {
  id: '01900000-0000-7000-8000-000000000e01',
  employee: {
    id: '01900000-0000-7000-8000-000000000704',
    name: 'Fábio Vigia',
    registrationNumber: '0004',
  },
  startDate: '2026-10-07',
  endDate: '2026-10-08',
  startTime: null,
  endTime: null,
  days: 2,
  issuerName: null,
  issuerRegistry: null,
  hasCid: false,
  notes: null,
  file: { name: 'atestado.pdf', contentType: 'application/pdf' },
  status: 'accepted',
  submittedBy: '01900000-0000-7000-8000-000000000102',
  reviewedBy: '01900000-0000-7000-8000-000000000102',
  reviewedAt: '2026-10-09T12:00:00.000Z',
  reviewNote: null,
  createdAt: '2026-10-09T12:00:00.000Z',
};

describe('Meus atestados (funcionário)', () => {
  it('só mostra os atestados anexados pela administração, sem opção de envio', async () => {
    server.use(
      ...sessionHandlers([], { hasEmployeeRecord: true }),
      http.get(`${API}/me/medical-certificates`, () => HttpResponse.json([certificate])),
    );
    renderApp('/meus-atestados');
    expect(await screen.findByText('07/10/2026 a 08/10/2026 (2 dias)')).toBeInTheDocument();
    expect(screen.getByText('Válido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir documento' })).toBeInTheDocument();
    expect(screen.getByText(/Entregue o atestado à administração/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar atestado/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});
