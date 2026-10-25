import {
  CONVERSATION_CATEGORY_LABELS,
  type ConversationMessage,
  formatTicketNumber,
} from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeftIcon,
  LockIcon,
  PaperclipIcon,
  RotateCcwIcon,
  SendIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage, useApi } from '@/lib/services';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { conversationsQueryKey } from './labels';

function Bubble({
  message,
  conversationId,
}: {
  message: ConversationMessage;
  conversationId: string;
}) {
  const api = useApi();
  const fromHr = message.side === 'hr';
  const open = useMutation({
    mutationFn: (fileId: string) => api.conversations.attachment(conversationId, fileId),
    onSuccess: (link) => window.open(link.url, '_blank', 'noopener'),
  });
  return (
    <div className={cn('flex', fromHr ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-xs',
          fromHr ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted',
        )}
      >
        <p className={cn('text-xs font-semibold', fromHr ? 'opacity-80' : 'text-muted-foreground')}>
          {message.author.name}
          {fromHr ? ' · RH' : ''}
        </p>
        <p className="whitespace-pre-wrap">{message.body}</p>
        {message.attachment ? (
          <button
            type="button"
            onClick={() => message.attachment && open.mutate(message.attachment.id)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold underline"
          >
            <PaperclipIcon className="size-3.5" aria-hidden="true" />
            {message.attachment.name}
          </button>
        ) : null}
        <p
          className={cn(
            'mt-1 text-right text-[11px]',
            fromHr ? 'opacity-70' : 'text-muted-foreground',
          )}
        >
          {new Date(message.createdAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}

/** Um chamado: a conversa, a resposta do RH (com anexo) e encerrar/reabrir. */
export function ConversationPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { id = '' } = useParams();
  const key = [...conversationsQueryKey, id];
  const conversation = useQuery({
    queryKey: key,
    queryFn: () => api.conversations.get(id),
    // Mensagens novas do funcionário aparecem sozinhas.
    refetchInterval: 10_000,
  });
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: conversationsQueryKey });

  const count = conversation.data?.messages.length ?? 0;
  useEffect(() => {
    // O jsdom (testes) não implementa scrollIntoView.
    const target = end.current;
    if (target && 'scrollIntoView' in target) target.scrollIntoView({ block: 'end' });
  }, [count]);

  const reply = useMutation({
    mutationFn: async () => {
      const attachmentFileId = file ? await uploadFile(api, file, 'conversation_attachment') : null;
      return api.conversations.reply(id, { body, attachmentFileId });
    },
    onSuccess: async () => {
      setBody('');
      setFile(null);
      await refresh();
    },
  });
  const close = useMutation({
    mutationFn: () => api.conversations.close(id),
    onSuccess: async () => {
      toast.success('Chamado encerrado.');
      await refresh();
    },
  });
  const reopen = useMutation({
    mutationFn: () => api.conversations.reopen(id),
    onSuccess: async () => {
      toast.success('Chamado reaberto.');
      await refresh();
    },
  });

  if (conversation.isPending) return <Skeleton className="h-96 w-full" />;
  if (conversation.isError) {
    return <Alert variant="destructive">{errorMessage(conversation.error)}</Alert>;
  }
  const data = conversation.data;
  const closed = data.status === 'closed';
  const error = reply.error ?? close.error ?? reopen.error;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <Link
          to="/gestao/atendimento"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          Atendimento
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="font-mono text-lg font-semibold text-primary">
            {formatTicketNumber(data.number)}
          </span>
          <h1 className="text-2xl font-bold">{data.subject}</h1>
          <Badge variant="outline">{CONVERSATION_CATEGORY_LABELS[data.category]}</Badge>
          {closed ? (
            <Badge variant="secondary">Encerrado</Badge>
          ) : (
            <Badge variant="soft">Em atendimento</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <Link to={`/pessoas/${data.employee.id}`} className="font-semibold hover:underline">
            {data.employee.name}
          </Link>{' '}
          · {data.employee.registrationNumber} · {data.unit.name} · aberto em{' '}
          {new Date(data.createdAt).toLocaleString('pt-BR')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {closed ? (
          <Button variant="outline" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
            {reopen.isPending ? <Spinner /> : <RotateCcwIcon />}
            Reabrir chamado
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={close.isPending}
            onClick={() => {
              if (
                window.confirm('Encerrar o chamado? O funcionário pode reabrir com nova mensagem.')
              ) {
                close.mutate();
              }
            }}
          >
            {close.isPending ? <Spinner /> : <LockIcon />}
            Encerrar chamado
          </Button>
        )}
      </div>

      <Card className="max-h-[60vh] space-y-3 overflow-y-auto p-4" aria-label="Mensagens">
        {data.messages.map((message) => (
          <Bubble key={message.id} message={message} conversationId={id} />
        ))}
        <div ref={end} />
      </Card>

      {closed ? (
        <Alert>Chamado encerrado. Reabra para responder.</Alert>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            reply.mutate();
          }}
        >
          <Textarea
            aria-label="Resposta"
            placeholder="Escreva a resposta ao funcionário"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-24"
            onKeyDown={(e) => {
              // Ctrl+Enter envia.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim()) reply.mutate();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
              <PaperclipIcon />
              Anexar
            </Button>
            {file ? (
              <span className="inline-flex items-center gap-1 text-sm">
                {file.name}
                <button type="button" aria-label="Remover anexo" onClick={() => setFile(null)}>
                  <XIcon className="size-4" />
                </button>
              </span>
            ) : null}
            <Button type="submit" className="ml-auto" disabled={!body.trim() || reply.isPending}>
              {reply.isPending ? <Spinner /> : <SendIcon />}
              Responder
            </Button>
          </div>
        </form>
      )}
      {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
    </div>
  );
}
