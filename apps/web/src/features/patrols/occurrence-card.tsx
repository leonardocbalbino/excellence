import {
  formatOccurrenceNumber,
  PATROL_OCCURRENCE_STATUS_LABELS,
  type PatrolOccurrence,
} from '@excellence/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, ImageIcon, MailIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { cn } from '@/lib/utils';
import { useCan } from '../access/access';
import { occurrencesQueryKey } from './occurrence-keys';

/**
 * Uma ocorrência de ronda (ADR 0024): o registro do funcionário (não muda), a foto, o envio
 * por e-mail e, para quem tem `patrols:manage`, o que foi feito e a resolução.
 */
export function OccurrenceCard({
  occurrence,
  showUnit = true,
}: {
  occurrence: PatrolOccurrence;
  showUnit?: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const canManage = useCan('patrols:manage');
  const [open, setOpen] = useState(false);
  const [actionTaken, setActionTaken] = useState(occurrence.actionTaken ?? '');
  const [resolution, setResolution] = useState(occurrence.resolution ?? '');
  const refresh = () => queryClient.invalidateQueries({ queryKey: occurrencesQueryKey });

  const photo = useMutation({
    mutationFn: () => api.patrols.occurrencePhoto(occurrence.id),
    onSuccess: (link) => window.open(link.url, '_blank', 'noopener'),
  });
  const save = useMutation({
    mutationFn: () =>
      api.patrols.resolveOccurrence(occurrence.id, {
        actionTaken,
        resolution: resolution.trim() || null,
      }),
    onSuccess: async (saved) => {
      toast.success(
        saved.status === 'resolved' ? 'Ocorrência resolvida.' : 'O que foi feito foi registrado.',
      );
      await refresh();
    },
  });
  const resend = useMutation({
    mutationFn: () => api.patrols.resendOccurrence(occurrence.id),
    onSuccess: async (saved) => {
      if (saved.emailError) toast.error(`E-mail não enviado: ${saved.emailError}`);
      else toast.success('E-mail reenviado.');
      await refresh();
    },
  });
  const error = photo.error ?? save.error ?? resend.error;
  const resolved = occurrence.status === 'resolved';

  return (
    <article
      className={cn('rounded-xl border bg-card', !resolved && 'border-l-4 border-l-warning')}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 px-4 py-3 text-left"
      >
        <span className="w-20 shrink-0 font-mono text-sm font-semibold text-primary">
          {formatOccurrenceNumber(occurrence.number)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-medium">{occurrence.description}</span>
          <span className="block text-sm text-muted-foreground">
            {formatDate(occurrence.localDate)} às {occurrence.localTime} ·{' '}
            {occurrence.employee.name}
            {showUnit ? ` · ${occurrence.unit.name}` : ''}
            {occurrence.route ? ` · ${occurrence.route.name}` : ''}
            {occurrence.point ? ` · ponto ${occurrence.point.name}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant={resolved ? 'soft' : 'warning'}>
            {PATROL_OCCURRENCE_STATUS_LABELS[occurrence.status]}
          </Badge>
          <ChevronDownIcon
            className={cn('size-4 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t px-4 py-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Registro do funcionário</p>
            <p className="text-sm whitespace-pre-wrap">{occurrence.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {occurrence.hasPhoto ? (
              <Button
                variant="outline"
                size="sm"
                disabled={photo.isPending}
                onClick={() => photo.mutate()}
              >
                {photo.isPending ? <Spinner /> : <ImageIcon />}
                Ver foto
              </Button>
            ) : (
              <span className="text-sm text-muted-foreground">Sem foto.</span>
            )}
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MailIcon className="size-4" aria-hidden="true" />
              {occurrence.emailedAt
                ? `E-mail enviado em ${new Date(occurrence.emailedAt).toLocaleString('pt-BR')}`
                : occurrence.emailError
                  ? `E-mail não enviado: ${occurrence.emailError}`
                  : 'Enviando e-mail…'}
            </span>
            {canManage && !occurrence.emailedAt ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={resend.isPending}
                onClick={() => resend.mutate()}
              >
                {resend.isPending ? <Spinner /> : <SendIcon />}
                Reenviar
              </Button>
            ) : null}
          </div>

          {canManage ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`action-${occurrence.id}`}>O que foi feito</Label>
                <Textarea
                  id={`action-${occurrence.id}`}
                  className="min-h-20"
                  value={actionTaken}
                  onChange={(e) => setActionTaken(e.target.value)}
                  placeholder="Ex.: síndico avisado; portão trancado pela equipe de manutenção."
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`resolution-${occurrence.id}`}>Resolução</Label>
                <Textarea
                  id={`resolution-${occurrence.id}`}
                  className="min-h-20"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="Preencha quando o problema estiver resolvido. Vazio = segue em aberto."
                />
              </div>
              <div>
                <Button type="submit" disabled={actionTaken.trim().length < 3 || save.isPending}>
                  {save.isPending ? <Spinner /> : null}
                  {resolution.trim() ? 'Salvar e marcar resolvida' : 'Salvar'}
                </Button>
              </div>
            </form>
          ) : occurrence.actionTaken || occurrence.resolution ? (
            <div className="space-y-2 text-sm">
              {occurrence.actionTaken ? (
                <p>
                  <strong>O que foi feito:</strong> {occurrence.actionTaken}
                </p>
              ) : null}
              {occurrence.resolution ? (
                <p>
                  <strong>Resolução:</strong> {occurrence.resolution}
                </p>
              ) : null}
            </div>
          ) : null}
          {occurrence.resolvedAt ? (
            <p className="text-xs text-muted-foreground">
              Resolvida em {new Date(occurrence.resolvedAt).toLocaleString('pt-BR')}
              {occurrence.resolvedBy ? ` por ${occurrence.resolvedBy.name}` : ''}.
            </p>
          ) : null}
          {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
        </div>
      ) : null}
    </article>
  );
}
