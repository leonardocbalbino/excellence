import type { AdjustmentInput } from '@excellence/shared';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDayLabel } from '@/lib/format';
import { errorMessage } from '@/lib/services';

export interface DisregardTarget {
  id: string;
  date: string;
  time: string;
}

/**
 * Pedido de ajuste: incluir uma marcação que faltou, ou desconsiderar uma marcação
 * escolhida no espelho. A marcação original nunca é apagada.
 */
export function AdjustmentForm({
  target,
  defaultDate,
  onSubmit,
  onCancel,
}: {
  target: DisregardTarget | null;
  defaultDate: string;
  onSubmit: (input: AdjustmentInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(
        target
          ? { type: 'disregard', targetEntryId: target.id, reason }
          : { type: 'include', date, time, reason },
      );
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="grid gap-3 rounded-lg border p-4" onSubmit={(e) => void submit(e)}>
      <p className="font-medium">
        {target
          ? `Desconsiderar a marcação das ${target.time} de ${formatDayLabel(target.date)}`
          : 'Incluir marcação que faltou'}
      </p>
      {target ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="adjust-date">Dia</Label>
            <Input
              id="adjust-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adjust-time">Horário</Label>
            <Input
              id="adjust-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="adjust-reason">Motivo</Label>
        <Input
          id="adjust-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: esqueci de marcar a saída"
        />
      </div>
      {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || reason.trim().length < 5 || (!target && !time)}>
          {saving ? <Spinner /> : null}
          Enviar pedido
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
