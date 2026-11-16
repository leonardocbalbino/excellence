import {
  modeNeedsPhoto,
  modeNeedsQr,
  type MyPatrols,
  type PatrolCheckinInput,
  type PatrolRun,
  parsePatrolCode,
} from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CameraIcon,
  CheckCircle2Icon,
  CircleIcon,
  ImageIcon,
  MapPinOffIcon,
  QrCodeIcon,
  RouteIcon,
  ShuffleIcon,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentPosition } from '@/lib/device/geolocation';
import { randomId } from '@/lib/random-id';
import { errorMessage, useApi } from '@/lib/services';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { CameraCapture } from '../time-tracking/camera-capture';
import { localTime, myPatrolsQueryKey, runStatusText, SLOT_STATUS } from './labels';
import { QrScanner } from './qr-scanner';

/** Rondas do funcionário: rotas atribuídas, horários de hoje e a ronda em andamento. */
export function MyPatrolsPage() {
  const api = useApi();
  const mine = useQuery({ queryKey: myPatrolsQueryKey, queryFn: () => api.patrols.mine() });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Rondas</h1>
        <p className="text-muted-foreground">
          Inicie a rota e registre cada ponto (QR code, foto ou os dois, conforme a rota). O horário
          registrado é o do servidor.
        </p>
      </div>
      {mine.isError ? <Alert variant="destructive">{errorMessage(mine.error)}</Alert> : null}
      {mine.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : mine.data?.current ? (
        <RunInProgress run={mine.data.current} />
      ) : (
        <RouteList routes={mine.data?.routes ?? []} />
      )}
    </div>
  );
}

function RouteList({ routes }: { routes: MyPatrols['routes'] }) {
  const api = useApi();
  const queryClient = useQueryClient();
  // Mesma chave enquanto a tentativa não tiver sucesso: reenviar não abre duas rondas.
  const attemptKey = useRef(randomId());
  const start = useMutation({
    mutationFn: (routeId: string) => api.patrols.start(routeId, attemptKey.current),
    onSuccess: (run) => {
      attemptKey.current = randomId();
      queryClient.setQueryData<MyPatrols>(myPatrolsQueryKey, (old) =>
        old ? { ...old, current: run } : old,
      );
      void queryClient.invalidateQueries({ queryKey: myPatrolsQueryKey });
    },
  });

  if (routes.length === 0) {
    return (
      <Alert>
        Nenhuma rota de ronda está atribuída a você. Se você faz rondas, fale com a gestão.
      </Alert>
    );
  }
  return (
    <div className="grid gap-4">
      {start.isError ? <Alert variant="destructive">{errorMessage(start.error)}</Alert> : null}
      {routes.map((route) => {
        const next = route.slots.find((s) => s.status === 'upcoming');
        return (
          <section key={route.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{route.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {route.unit.name} · {route.pointsCount} pontos · previsão de{' '}
                  {route.expectedMinutes} min
                </p>
              </div>
              {next ? <Badge variant="soft">Próxima: {next.localTime}</Badge> : null}
            </div>
            {route.slots.length > 0 ? (
              <ul
                className="mt-4 flex flex-wrap gap-2"
                aria-label={`Horários de hoje: ${route.name}`}
              >
                {route.slots.map((slot) => (
                  <li
                    key={slot.at}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold',
                      slot.status === 'missed' &&
                        'border-warning-border bg-warning-soft text-warning',
                      slot.status === 'done' && 'bg-primary-soft text-primary',
                      slot.status === 'in_progress' && 'border-primary text-primary',
                    )}
                  >
                    <span className="font-mono">{slot.localTime}</span> · {SLOT_STATUS[slot.status]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Sem horários fixos hoje.</p>
            )}
            <Button
              size="lg"
              className="mt-5 w-full sm:w-auto"
              disabled={start.isPending}
              onClick={() => start.mutate(route.id)}
            >
              {start.isPending && start.variables === route.id ? (
                <Spinner />
              ) : route.checkinMode === 'photo' ? (
                <CameraIcon />
              ) : (
                <QrCodeIcon />
              )}
              {route.checkinMode === 'photo' ? 'Iniciar ronda' : 'Iniciar e ler QR code'}
            </Button>
          </section>
        );
      })}
    </div>
  );
}

/** Localização para conferir o ponto; sem ela, o check-in segue (fica sinalizado). */
async function tryPosition() {
  try {
    return await getCurrentPosition({ timeoutMs: 8_000 });
  } catch {
    return null;
  }
}

function RunInProgress({ run }: { run: PatrolRun }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(true);
  const [note, setNote] = useState('');
  const attemptKey = useRef(randomId());
  const update = (next: PatrolRun) =>
    queryClient.setQueryData<MyPatrols>(myPatrolsQueryKey, (old) =>
      old ? { ...old, current: next.status === 'in_progress' ? next : null } : old,
    );

  const needsQr = modeNeedsQr(run.checkinMode);
  const needsPhoto = modeNeedsPhoto(run.checkinMode);
  // QR e foto: o QR lido espera a foto do ponto antes do registro.
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const checkin = useMutation({
    mutationFn: async (target: {
      code?: string | null;
      pointId?: string | null;
      photo?: Blob | null;
    }) => {
      const position = await tryPosition();
      const photoFileId = target.photo
        ? await uploadFile(
            api,
            new File([target.photo], 'ponto.jpg', { type: 'image/jpeg' }),
            'patrol_photo',
          )
        : null;
      const input: PatrolCheckinInput = {
        code: target.code ?? null,
        pointId: target.pointId ?? null,
        photoFileId,
      };
      return api.patrols.checkin(
        run.id,
        {
          ...input,
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          accuracyMeters: position?.accuracyMeters ?? null,
          deviceTimestamp: new Date().toISOString(),
        },
        attemptKey.current,
      );
    },
    onSuccess: (next) => {
      attemptKey.current = randomId();
      setScannedCode(null);
      const latest = next.points
        .filter((p) => p.checkin)
        .sort((a, b) =>
          (b.checkin?.recordedAt ?? '').localeCompare(a.checkin?.recordedAt ?? ''),
        )[0];
      if (next.checked >= next.total) {
        // A ronda continua aberta: quem fez conclui (com comentário, se quiser).
        setScanning(false);
        toast.success('Todos os pontos lidos. Confira e toque em Concluir ronda.');
      } else if (latest?.checkin) {
        toast.success(`${latest.name} registrado às ${latest.checkin.localTime}.`);
      }
      update(next);
      void queryClient.invalidateQueries({ queryKey: myPatrolsQueryKey });
    },
    onError: () => {
      attemptKey.current = randomId();
    },
  });
  const finish = useMutation({
    mutationFn: () => api.patrols.finish(run.id, { note: note.trim() || null }),
    onSuccess: (next) => {
      toast.success(next.status === 'completed' ? 'Ronda concluída.' : 'Ronda encerrada.');
      update(next);
      void queryClient.invalidateQueries({ queryKey: myPatrolsQueryKey });
    },
  });

  // A rota pode exigir só parte dos pontos (mínimo); abaixo dele, concluir pede o motivo.
  const missing = Math.max(0, run.required - run.checked);
  const ratio = run.total > 0 ? run.checked / run.total : 0;
  return (
    <div className="grid gap-6">
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm text-white/80">
              {run.unit.name} · iniciada às {localTime(run.startedAt, run.timezone)}
            </p>
            <h2 className="text-2xl font-bold">{run.route.name}</h2>
          </div>
          <Badge
            variant={run.lateMinutes > 0 ? 'warning' : 'soft'}
            className={run.lateMinutes > 0 ? '' : 'bg-white/15 text-white'}
          >
            {runStatusText(run)}
          </Badge>
        </div>
        <div className="mt-4 flex items-baseline justify-between text-sm">
          <span>
            {run.checked} de {run.total} pontos
          </span>
          <span className="text-white/80">
            Previsão de término: {localTime(run.expectedEndAt, run.timezone)}
          </span>
        </div>
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/20"
          role="progressbar"
          aria-label="Pontos registrados"
          aria-valuemin={0}
          aria-valuemax={run.total}
          aria-valuenow={run.checked}
        >
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${String(Math.round(ratio * 100))}%` }}
          />
        </div>
        {run.nextPoint ? (
          <p className="mt-4 text-lg">
            Próximo ponto: <strong>{run.nextPoint.name}</strong>
            {run.enforceOrder ? (
              <span className="block text-sm text-white/80">Esta rota exige a ordem.</span>
            ) : null}
          </p>
        ) : null}
      </section>

      <section
        className="rounded-2xl border bg-card p-5"
        aria-label={needsQr ? 'Leitura do QR code' : 'Foto do ponto'}
      >
        {checkin.isError ? (
          <Alert variant="destructive" className="mb-4">
            {errorMessage(checkin.error)}
          </Alert>
        ) : null}
        {!needsQr ? (
          <PhotoCheckin
            run={run}
            busy={checkin.isPending}
            onSubmit={(pointId, photo) => checkin.mutate({ pointId, photo })}
          />
        ) : scannedCode ? (
          <PhotoCheckin
            run={run}
            busy={checkin.isPending}
            fixedPointId={parsePatrolCode(scannedCode)?.pointId ?? null}
            onCancel={() => setScannedCode(null)}
            onSubmit={(_pointId, photo) => checkin.mutate({ code: scannedCode, photo })}
          />
        ) : scanning ? (
          <QrScanner
            onCode={(code) => {
              if (needsPhoto) {
                setScannedCode(code);
                setScanning(false);
              } else {
                checkin.mutate({ code });
              }
            }}
            disabled={checkin.isPending}
          />
        ) : (
          <Button size="lg" className="w-full" onClick={() => setScanning(true)}>
            <QrCodeIcon />
            Ler QR code
          </Button>
        )}
        {needsQr && scanning && !scannedCode ? (
          <Button variant="outline" className="mt-3 w-full" onClick={() => setScanning(false)}>
            Fechar câmera
          </Button>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="pontos-ronda">
        <h2 id="pontos-ronda" className="text-xl font-bold">
          Pontos
        </h2>
        <ol className="mt-3 grid gap-2">
          {run.points.map((point, index) => (
            <li
              key={point.id}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5',
                point.checkin ? 'bg-primary-soft' : 'border border-dashed',
                run.nextPoint?.id === point.id && 'border-primary',
              )}
            >
              {point.checkin ? (
                <CheckCircle2Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <CircleIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="flex-1">
                <span className="text-muted-foreground">{index + 1}.</span> {point.name}
              </span>
              {point.checkin?.hasPhoto ? (
                <ImageIcon className="size-4 text-muted-foreground" aria-label="com foto" />
              ) : null}
              {point.checkin?.outOfOrder ? (
                <Badge variant="outline">
                  <ShuffleIcon className="mr-1 size-3" aria-hidden="true" />
                  Fora de ordem
                </Badge>
              ) : null}
              {point.checkin?.geofenceStatus === 'outside' ? (
                <Badge variant="warning">
                  <MapPinOffIcon className="mr-1 size-3" aria-hidden="true" />
                  Longe do ponto
                </Badge>
              ) : null}
              <span className="font-mono text-sm">
                {point.checkin ? point.checkin.localTime : '—'}
                <span className="sr-only">{point.checkin ? '' : 'pendente'}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="encerrar-ronda">
        <h2 id="encerrar-ronda" className="flex items-center gap-2 text-xl font-bold">
          <RouteIcon className="size-5" aria-hidden="true" />
          Concluir ronda
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {missing > 0
            ? `Faltam ${String(missing)} ponto(s). Para concluir assim, explique o motivo.`
            : 'Pontos exigidos registrados. Se quiser, deixe um comentário.'}
        </p>
        <div className="mt-3 grid gap-1.5">
          <Label htmlFor="finish-note">{missing > 0 ? 'Motivo' : 'Comentário (opcional)'}</Label>
          <Textarea
            id="finish-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              missing > 0
                ? 'Ex.: acesso ao galpão bloqueado pela manutenção.'
                : 'Ex.: tudo em ordem; lâmpada da garagem queimada.'
            }
          />
        </div>
        {finish.isError ? (
          <Alert variant="destructive" className="mt-3">
            {errorMessage(finish.error)}
          </Alert>
        ) : null}
        <Button
          variant={missing > 0 ? 'outline' : 'default'}
          className="mt-4"
          disabled={finish.isPending || (missing > 0 && !note.trim())}
          onClick={() => finish.mutate()}
        >
          {finish.isPending ? <Spinner /> : null}
          Concluir ronda
        </Button>
      </section>
    </div>
  );
}

/**
 * Registro do ponto por foto (câmera traseira). Sem QR code, a pessoa escolhe o ponto (o
 * próximo vem marcado); depois do QR, o ponto já vem do código.
 */
function PhotoCheckin({
  run,
  busy,
  fixedPointId,
  onSubmit,
  onCancel,
}: {
  run: PatrolRun;
  busy: boolean;
  fixedPointId?: string | null;
  onSubmit: (pointId: string, photo: Blob) => void;
  onCancel?: () => void;
}) {
  const pending = run.points.filter((p) => !p.checkin);
  const [choice, setChoice] = useState<string | null>(null);
  const pointId = fixedPointId ?? choice ?? run.nextPoint?.id ?? pending[0]?.id ?? null;
  const [photo, setPhoto] = useState<Blob | null>(null);
  const name = run.points.find((p) => p.id === pointId)?.name;

  if (pending.length === 0) {
    return <p className="text-sm text-muted-foreground">Todos os pontos foram registrados.</p>;
  }
  return (
    <div className="grid gap-4">
      {fixedPointId === undefined ? (
        <div className="grid gap-1.5">
          <Label htmlFor="photo-point">Ponto</Label>
          <Select
            id="photo-point"
            value={pointId ?? ''}
            onChange={(e) => setChoice(e.target.value)}
          >
            {pending.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="font-medium">
          QR code lido{name ? ': ' + name : ''}. Agora tire a foto do ponto.
        </p>
      )}
      <CameraCapture key={pointId ?? 'nenhum'} onChange={setPhoto} initialFacing="environment" />
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          className="flex-1"
          disabled={busy || !photo || !pointId}
          onClick={() => {
            if (photo && pointId) onSubmit(pointId, photo);
          }}
        >
          {busy ? <Spinner /> : <CameraIcon />}
          Registrar ponto{name ? ' ' + name : ''}
        </Button>
        {onCancel ? (
          <Button size="lg" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
