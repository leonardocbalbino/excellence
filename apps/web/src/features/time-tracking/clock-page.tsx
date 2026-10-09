import { ApiError } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  ClipboardListIcon,
  FingerprintIcon,
  MapPinIcon,
  MapPinOffIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import {
  type DevicePosition,
  GeolocationError,
  getCurrentPosition,
} from '@/lib/device/geolocation';
import { todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { uploadFile } from '@/lib/upload';
import { CameraCapture } from './camera-capture';
import { GEOFENCE_LABELS } from './labels';
import { timeEntriesQueryKey } from './query-keys';

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function ClockPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const now = useNow();
  const today = todayIso();
  const settings = useQuery({ queryKey: ['clock-settings'], queryFn: () => api.time.settings() });
  const todays = useQuery({
    queryKey: [...timeEntriesQueryKey, 'me', today],
    queryFn: () => api.time.mine(today, today),
  });
  const [withSelfie, setWithSelfie] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  // Mesma chave enquanto a tentativa não tiver sucesso: reenviar não duplica a marcação.
  const attemptKey = useRef(crypto.randomUUID());
  const selfieRequired = settings.data?.requireSelfie ?? false;
  const useSelfie = selfieRequired || withSelfie;

  const clock = useMutation({
    mutationFn: async () => {
      setLocationNote(null);
      let position: DevicePosition | null = null;
      try {
        position = await getCurrentPosition({ timeoutMs: 20_000 });
      } catch (error) {
        const message =
          error instanceof GeolocationError ? error.message : 'Localização indisponível.';
        if (settings.data?.requireLocation) throw new Error(message, { cause: error });
        setLocationNote(`${message} O ponto foi registrado sem localização.`);
      }
      let selfieFileId: string | null = null;
      if (useSelfie) {
        if (!photo) throw new Error('Capture a foto antes de registrar.');
        const file = new File([photo], 'selfie.jpg', { type: 'image/jpeg' });
        selfieFileId = await uploadFile(api, file, 'selfie');
      }
      return api.time.clock(
        {
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          accuracyMeters: position?.accuracyMeters ?? null,
          deviceTimestamp: new Date().toISOString(),
          selfieFileId,
        },
        attemptKey.current,
      );
    },
    onSuccess: async () => {
      attemptKey.current = crypto.randomUUID();
      setPhoto(null);
      await queryClient.invalidateQueries({ queryKey: timeEntriesQueryKey });
    },
  });

  const last = clock.data;
  const time = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const date = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <Button asChild variant="outline" size="lg" className="w-full">
        <Link to="/ponto/espelho">
          <ClipboardListIcon />
          Visualizar espelho de ponto
        </Link>
      </Button>
      <Card>
        <CardContent className="grid gap-6 pt-6 text-center">
          <div>
            <p className="font-mono text-5xl font-semibold tabular-nums" aria-live="off">
              {time}
            </p>
            <p className="text-muted-foreground capitalize">{date}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              O horário registrado é o do servidor, não o do seu aparelho.
            </p>
          </div>

          {settings.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              {selfieRequired ? null : (
                <div className="flex items-center justify-center gap-2">
                  <Checkbox
                    id="with-selfie"
                    checked={withSelfie}
                    onCheckedChange={(checked) => setWithSelfie(checked === true)}
                  />
                  <Label htmlFor="with-selfie">Registrar com foto</Label>
                </div>
              )}
              {useSelfie ? <CameraCapture onChange={setPhoto} /> : null}
              <Button
                size="lg"
                className="h-16 text-lg"
                onClick={() => clock.mutate()}
                disabled={clock.isPending || (useSelfie && !photo)}
              >
                {clock.isPending ? <Spinner /> : <FingerprintIcon className="size-6" />}
                Registrar ponto
              </Button>
            </>
          )}

          {clock.isError ? (
            <Alert variant="destructive">
              {clock.error instanceof ApiError || !(clock.error instanceof Error)
                ? errorMessage(clock.error)
                : clock.error.message}{' '}
              Tente de novo: se a marcação já tiver sido gravada, ela não será duplicada.
            </Alert>
          ) : null}
          {last ? (
            <Alert>
              <p className="flex items-center justify-center gap-2 font-medium">
                <CheckCircle2Icon className="size-4 text-success" aria-hidden="true" />
                Ponto registrado às {last.localTime}
              </p>
              <p className="text-sm text-muted-foreground">
                {GEOFENCE_LABELS[last.geofenceStatus]}
                {last.distanceMeters !== null ? ` (${Math.round(last.distanceMeters)} m)` : ''} ·
                NSR {last.nsr}
              </p>
              <Link
                to={`/ponto/comprovante/${last.id}`}
                className="text-sm text-primary hover:underline"
              >
                Ver comprovante
              </Link>
            </Alert>
          ) : null}
          {locationNote ? <Alert variant="warning">{locationNote}</Alert> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marcações de hoje</CardTitle>
        </CardHeader>
        <CardContent>
          {todays.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : todays.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma marcação hoje.</p>
          ) : (
            <ul className="grid gap-2">
              {todays.data?.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-mono text-base">{entry.localTime}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {entry.geofenceStatus === 'outside' ? (
                      <MapPinOffIcon className="size-4 text-destructive" aria-hidden="true" />
                    ) : (
                      <MapPinIcon className="size-4" aria-hidden="true" />
                    )}
                    {GEOFENCE_LABELS[entry.geofenceStatus]}
                  </span>
                  {entry.kind !== 'clock' ? <Badge variant="secondary">Ajuste</Badge> : null}
                  {entry.disregarded ? <Badge variant="outline">Desconsiderada</Badge> : null}
                  <Link
                    to={`/ponto/comprovante/${entry.id}`}
                    className="text-primary hover:underline"
                  >
                    Comprovante
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
