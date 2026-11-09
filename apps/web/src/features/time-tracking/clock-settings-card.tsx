import type { ClockSettings } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { errorMessage, useApi } from '@/lib/services';

/** Parâmetros do ponto (regras que dependem de decisão da empresa: pendências P-008 e P-030). */
export function ClockSettingsCard() {
  const api = useApi();
  const settings = useQuery({ queryKey: ['clock-settings'], queryFn: () => api.time.settings() });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registro de ponto</CardTitle>
        <CardDescription>
          Como a marcação trata localização, foto, almoço e folga. Confirme com o jurídico antes de
          recusar marcações (pendências P-008 e P-030).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.data ? (
          <SettingsForm initial={settings.data} />
        ) : (
          <Skeleton className="h-40 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

function SettingsForm({ initial }: { initial: ClockSettings }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.time.updateSettings(values);
      await queryClient.invalidateQueries({ queryKey: ['clock-settings'] });
      toast.success('Parâmetros do ponto salvos.');
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="outside-geofence">Marcação fora da cerca virtual</Label>
        <Select
          id="outside-geofence"
          value={values.outsideGeofence}
          onChange={(e) =>
            setValues({
              ...values,
              outsideGeofence: e.target.value as ClockSettings['outsideGeofence'],
            })
          }
        >
          <option value="allow">Aceitar e sinalizar</option>
          <option value="block">Recusar</option>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="require-location"
          checked={values.requireLocation}
          onCheckedChange={(c) => setValues({ ...values, requireLocation: c === true })}
        />
        <Label htmlFor="require-location">Exigir localização para marcar</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="require-selfie"
          checked={values.requireSelfie}
          onCheckedChange={(c) => setValues({ ...values, requireSelfie: c === true })}
        />
        <Label htmlFor="require-selfie">Exigir foto (selfie) para marcar</Label>
      </div>
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="break-punches"
            checked={values.breakPunches}
            onCheckedChange={(c) => setValues({ ...values, breakPunches: c === true })}
          />
          <Label htmlFor="break-punches">Marcar saída e retorno do almoço</Label>
        </div>
        <p className="pl-6 text-sm text-muted-foreground">
          Ligado: entrada, saída para almoço, retorno do almoço e saída. Desligado: só entrada e
          saída. Marcações a mais no dia só por ajuste de ponto.
        </p>
      </div>
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <Checkbox
            id="block-off-day"
            checked={values.blockOffDay}
            onCheckedChange={(c) => setValues({ ...values, blockOffDay: c === true })}
          />
          <Label htmlFor="block-off-day">Não abrir o ponto em dia de folga da escala</Label>
        </div>
        <p className="pl-6 text-sm text-muted-foreground">
          Quem trabalhar na folga (dobra, cobertura) precisa de ajuste de ponto aprovado. A saída de
          um turno que começou na véspera sempre é aceita.
        </p>
      </div>
      <div className="grid gap-2 sm:w-72">
        <Label htmlFor="overnight-grace">Tolerância após turno noturno (minutos)</Label>
        <Input
          id="overnight-grace"
          inputMode="numeric"
          value={values.overnightGraceMinutes}
          onChange={(e) =>
            setValues({ ...values, overnightGraceMinutes: Number(e.target.value) || 0 })
          }
        />
        <p className="text-sm text-muted-foreground">
          Marcações até esse tempo depois do fim de um turno que vira a meia-noite contam para o dia
          em que o turno começou.
        </p>
      </div>
      {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
      <div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner /> : null}
          Salvar parâmetros
        </Button>
      </div>
    </div>
  );
}
