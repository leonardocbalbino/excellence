import type { Adjustment } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, useApi } from '@/lib/services';
import { adjustmentsQueryKey, timesheetQueryKey } from './query-keys';

/** Ajustes de ponto pendentes da equipe (escopo da permissão de aprovação). */
export function ApprovalsPage() {
  const api = useApi();
  const pending = useQuery({
    queryKey: [...adjustmentsQueryKey, 'pending'],
    queryFn: () => api.adjustments.toApprove('pending'),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ajustes de ponto</h1>
        <p className="text-muted-foreground">
          Pedidos da sua equipe. Aprovado, o ajuste vira uma nova marcação; a original fica
          registrada.
        </p>
      </div>
      {pending.isError ? <Alert variant="destructive">{errorMessage(pending.error)}</Alert> : null}
      {pending.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : pending.data?.length === 0 ? (
        <Alert>Nenhum pedido pendente.</Alert>
      ) : (
        pending.data?.map((adjustment) => (
          <AdjustmentCard key={adjustment.id} adjustment={adjustment} />
        ))
      )}
    </div>
  );
}

function AdjustmentCard({ adjustment }: { adjustment: Adjustment }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: adjustmentsQueryKey });
    await queryClient.invalidateQueries({ queryKey: timesheetQueryKey });
  };
  const approve = useMutation({
    mutationFn: () => api.adjustments.approve(adjustment.id, { note: note || null }),
    onSuccess: async () => {
      toast.success('Ajuste aprovado.');
      await refresh();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.adjustments.reject(adjustment.id, { note }),
    onSuccess: async () => {
      toast.success('Ajuste recusado.');
      await refresh();
    },
  });
  const busy = approve.isPending || reject.isPending;
  const error = approve.error ?? reject.error;

  return (
    <Card>
      <CardContent className="grid gap-3 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link
            to={`/pessoas/${adjustment.employee.id}/espelho`}
            className="font-medium text-primary hover:underline"
          >
            {adjustment.employee.name}
          </Link>
          <span className="text-sm text-muted-foreground">
            pedido em {new Date(adjustment.createdAt).toLocaleString('pt-BR')}
          </span>
        </div>
        <p>
          {adjustment.type === 'include'
            ? `Incluir marcação em ${adjustment.proposedLocal ?? ''}`
            : `Desconsiderar a marcação de ${adjustment.targetEntry?.localDate ?? ''} às ${adjustment.targetEntry?.localTime ?? ''}`}
        </p>
        <p className="text-sm text-muted-foreground">Motivo: {adjustment.reason}</p>
        <div className="grid gap-2">
          <Label htmlFor={`note-${adjustment.id}`}>Observação (obrigatória para recusar)</Label>
          <Input
            id={`note-${adjustment.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
        <div className="flex gap-2">
          <Button onClick={() => approve.mutate()} disabled={busy}>
            {approve.isPending ? <Spinner /> : <CheckIcon />}
            Aprovar
          </Button>
          <Button
            variant="outline"
            onClick={() => reject.mutate()}
            disabled={busy || note.trim() === ''}
          >
            {reject.isPending ? <Spinner /> : <XIcon />}
            Recusar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
