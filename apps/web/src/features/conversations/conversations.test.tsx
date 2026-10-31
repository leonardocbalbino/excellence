import type { ConversationDetail } from '@excellence/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderApp } from '@/test/render-app';
import { API, server, sessionHandlers } from '@/test/server';

const ID = '01900000-0000-7000-8000-000000000e01';

const conversation: ConversationDetail = {
  id: ID,
  number: 42,
  category: 'benefits',
  subject: 'VA veio menor',
  status: 'open',
  employee: {
    id: '01900000-0000-7000-8000-000000000704',
    name: 'Fábio Vigia',
    registrationNumber: '0004',
  },
  unit: { id: '01900000-0000-7000-8000-000000000a01', name: 'Maple Bear' },
  lastMessage: {
    side: 'employee',
    preview: 'Veio 15 dias, trabalhei 18.',
    at: '2026-10-24T12:00:00.000Z',
  },
  unread: 1,
  createdAt: '2026-10-24T12:00:00.000Z',
  closedAt: null,
  messages: [
    {
      id: '01900000-0000-7000-8000-000000000e11',
      side: 'employee',
      author: { id: '01900000-0000-7000-8000-000000000104', name: 'Fábio Vigia' },
      body: 'Veio 15 dias, trabalhei 18.',
      attachment: null,
      createdAt: '2026-10-24T12:00:00.000Z',
    },
  ],
};

describe('Atendimento (RH)', () => {
  it('lista o chamado com o número, abre a conversa e responde', async () => {
    let sent: unknown;
    server.use(
      ...sessionHandlers(['conversations:manage']),
      http.get(`${API}/conversations`, () => {
        const { messages: _messages, ...summary } = conversation;
        return HttpResponse.json([summary]);
      }),
      http.get(`${API}/conversations/:id`, () => HttpResponse.json(conversation)),
      http.post(`${API}/conversations/:id/messages`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          {
            id: '01900000-0000-7000-8000-000000000e12',
            side: 'hr',
            author: { id: '01900000-0000-7000-8000-000000000102', name: 'Rafael do RH' },
            body: 'Vamos conferir.',
            attachment: null,
            createdAt: '2026-10-24T13:00:00.000Z',
          },
          { status: 201 },
        );
      }),
    );

    renderApp('/gestao/atendimento');
    const link = await screen.findByRole('link', { name: /#000042/ });
    expect(link).toHaveTextContent('VA veio menor');
    expect(screen.getByLabelText('1 mensagens novas')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'VA veio menor' })).toBeInTheDocument();
    expect(screen.getByText('Veio 15 dias, trabalhei 18.', { selector: 'p' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Resposta'), 'Vamos conferir.');
    await user.click(screen.getByRole('button', { name: 'Responder' }));
    await waitFor(() => expect(sent).toEqual({ body: 'Vamos conferir.', attachmentFileId: null }));
  });
});
