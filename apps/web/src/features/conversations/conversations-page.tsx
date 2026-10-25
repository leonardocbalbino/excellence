import {
  CONVERSATION_CATEGORY_LABELS,
  type ConversationCategory,
  conversationCategorySchema,
  type ConversationStatus,
  formatTicketNumber,
} from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { MessagesSquareIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { errorMessage, useApi } from '@/lib/services';
import { cn } from '@/lib/utils';
import { conversationsQueryKey } from './labels';

function when(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR');
}

/**
 * Atendimento (ADR 0023): os chamados que os funcionários abrem pelo app, cada um com número
 * único. Os abertos e com mensagem nova aparecem primeiro.
 */
export function ConversationsPage() {
  const api = useApi();
  const [status, setStatus] = useState<ConversationStatus | 'all'>('open');
  const [category, setCategory] = useState<ConversationCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const conversations = useQuery({
    queryKey: [...conversationsQueryKey, 'list', status, category],
    queryFn: () =>
      api.conversations.list({
        ...(status === 'all' ? {} : { status }),
        ...(category === 'all' ? {} : { category }),
      }),
    // Chamados novos chegam sem precisar recarregar.
    refetchInterval: 20_000,
  });
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const items =
    conversations.data?.filter(
      (c) =>
        !term ||
        c.employee.name.toLocaleLowerCase('pt-BR').includes(term) ||
        c.subject.toLocaleLowerCase('pt-BR').includes(term) ||
        formatTicketNumber(c.number).includes(term.replace(/^#?/, '#')) ||
        String(c.number) === term,
    ) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Atendimento</h1>
        <p className="max-w-3xl text-muted-foreground">
          Chamados abertos pelos funcionários no app. Cada chamado tem um número único; a resposta
          chega no celular do funcionário por notificação.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="conversation-status">Situação</Label>
          <Select
            id="conversation-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ConversationStatus | 'all')}
          >
            <option value="open">Em atendimento</option>
            <option value="closed">Encerrados</option>
            <option value="all">Todos</option>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="conversation-category">Assunto</Label>
          <Select
            id="conversation-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ConversationCategory | 'all')}
          >
            <option value="all">Todos</option>
            {conversationCategorySchema.options.map((c) => (
              <option key={c} value={c}>
                {CONVERSATION_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        <Input
          type="search"
          aria-label="Buscar chamado"
          placeholder="Número, funcionário ou assunto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72"
        />
      </div>

      {conversations.isError ? (
        <Alert variant="destructive">{errorMessage(conversations.error)}</Alert>
      ) : null}
      {conversations.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <MessagesSquareIcon className="size-8" aria-hidden="true" />
          Nenhum chamado {status === 'open' ? 'em atendimento' : 'encontrado'}.
        </Card>
      ) : (
        <Card className="divide-y">
          {items.map((c) => (
            <Link
              key={c.id}
              to={`/gestao/atendimento/${c.id}`}
              className="flex items-start gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <span className="w-20 shrink-0 font-mono text-sm font-semibold text-primary">
                {formatTicketNumber(c.number)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className={cn('truncate', c.unread > 0 ? 'font-bold' : 'font-semibold')}>
                    {c.subject}
                  </span>
                  <Badge variant="outline">{CONVERSATION_CATEGORY_LABELS[c.category]}</Badge>
                  {c.status === 'closed' ? <Badge variant="secondary">Encerrado</Badge> : null}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {c.employee.name} · {c.employee.registrationNumber} · {c.unit.name}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {c.lastMessage.side === 'hr' ? 'RH: ' : ''}
                  {c.lastMessage.preview}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                {when(c.lastMessage.at)}
                {c.unread > 0 ? (
                  <Badge aria-label={`${String(c.unread)} mensagens novas`}>{c.unread}</Badge>
                ) : null}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
