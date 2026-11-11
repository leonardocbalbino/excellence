import { useQuery } from '@tanstack/react-query';
import type { PatrolRun } from '@excellence/shared';
import { CameraIcon, CheckCircle2Icon, ChevronLeftIcon, CircleIcon } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/feedback';
import { errorMessage, useApi } from '@/lib/services';
import { CHECKIN_LOCATION, localTime, patrolRunQueryKey, runStatusText } from './labels';

/** Detalhe de uma ronda: quem fez, quando, o check-in de cada ponto e as fotos no local. */
export function PatrolRunPage() {
  const api = useApi();
  const { id = '' } = useParams();
  const run = useQuery({
    queryKey: [...patrolRunQueryKey, id],
    queryFn: () => api.patrols.get(id),
    refetchInterval: (query) => (query.state.data?.status === 'in_progress' ? 30_000 : false),
  });

  if (run.isPending) return <Skeleton className="h-64 w-full" />;
  if (run.isError) return <Alert variant="destructive">{errorMessage(run.error)}</Alert>;
  const data = run.data;
  const tz = data.timezone;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/gestao/rondas"
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        Rondas do dia
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{data.unit.name}</p>
          <h1 className="text-3xl font-bold">{data.route.name}</h1>
          <p className="text-muted-foreground">{data.employee.name}</p>
        </div>
        <Badge
          variant={
            data.status === 'completed'
              ? 'soft'
              : data.lateMinutes > 0 || data.status === 'incomplete'
                ? 'warning'
                : 'default'
          }
        >
          {runStatusText(data)}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Horário previsto</dt>
          <dd className="font-mono font-semibold">
            {data.scheduledFor ? localTime(data.scheduledFor, tz) : 'Fora de horário'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Início</dt>
          <dd className="font-mono font-semibold">{localTime(data.startedAt, tz)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Término previsto</dt>
          <dd className="font-mono font-semibold">{localTime(data.expectedEndAt, tz)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Término</dt>
          <dd className="font-mono font-semibold">
            {data.finishedAt ? localTime(data.finishedAt, tz) : '—'}
          </dd>
        </div>
      </dl>

      {data.finishNote ? (
        <Alert variant={data.status === 'incomplete' ? 'warning' : 'default'}>
          <strong>
            {data.status === 'incomplete' ? 'Motivo do encerramento:' : 'Comentário de quem fez:'}
          </strong>{' '}
          {data.finishNote}
        </Alert>
      ) : null}

      <section className="rounded-2xl border bg-card p-5" aria-labelledby="checkins">
        <h2 id="checkins" className="text-xl font-bold">
          Pontos ({data.checked} de {data.total})
        </h2>
        <ol className="mt-3 grid gap-2">
          {data.points.map((point, index) => (
            <li
              key={point.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
            >
              {point.checkin ? (
                <CheckCircle2Icon className="size-5 text-primary" aria-hidden="true" />
              ) : (
                <CircleIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="flex-1 font-medium">
                {index + 1}. {point.name}
              </span>
              {point.checkin ? (
                <>
                  {point.checkin.outOfOrder ? <Badge variant="outline">Fora de ordem</Badge> : null}
                  <span className="text-xs text-muted-foreground">
                    {CHECKIN_LOCATION[point.checkin.geofenceStatus]}
                    {point.checkin.distanceMeters !== null
                      ? ` (${String(Math.round(point.checkin.distanceMeters))} m)`
                      : ''}
                  </span>
                  <span className="font-mono font-semibold">{point.checkin.localTime}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Não registrado</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {data.photos.length > 0 ? (
        <section className="rounded-2xl border bg-card p-5" aria-labelledby="run-photos">
          <h2 id="run-photos" className="flex items-center gap-2 text-xl font-bold">
            <CameraIcon className="size-5" aria-hidden="true" />
            Fotos no local ({data.photos.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Tiradas pelo funcionário durante a ronda para mostrar que esteve no ponto.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.photos.map((photo) => (
              <RunPhoto key={photo.id} runId={data.id} photo={photo} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RunPhoto({ runId, photo }: { runId: string; photo: PatrolRun['photos'][number] }) {
  const api = useApi();
  const link = useQuery({
    queryKey: [...patrolRunQueryKey, runId, 'photo', photo.id],
    queryFn: () => api.patrols.runPhoto(runId, photo.id),
    // O link é temporário: renova antes de vencer.
    staleTime: 4 * 60_000,
  });
  const caption = `${photo.localTime} · ${photo.point?.name ?? 'Fora dos pontos'}`;
  return (
    <li className="overflow-hidden rounded-xl border">
      {link.data ? (
        <a href={link.data.url} target="_blank" rel="noreferrer">
          <img
            src={link.data.url}
            alt={`Foto no local, ${caption}`}
            className="aspect-square w-full object-cover"
          />
        </a>
      ) : link.isError ? (
        <p className="p-3 text-sm text-destructive">Não foi possível abrir a foto.</p>
      ) : (
        <Skeleton className="aspect-square w-full" />
      )}
      <p className="px-3 py-2 text-sm">
        <span className="font-mono font-semibold">{photo.localTime}</span> ·{' '}
        {photo.point?.name ?? 'Fora dos pontos'}
      </p>
    </li>
  );
}
