import type { MyAnnouncement, PlannedDay, TimeEntry } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import {
  GiftIcon,
  ClockIcon,
  FileTextIcon,
  type LucideIcon,
  MapPinIcon,
  LinkIcon,
  QrCodeIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { StatCard } from '@/components/ui/stat-card';
import { addDaysIso, formatDayLabel, formatLongToday, formatMinutes, todayIso } from '@/lib/format';
import { useApi, useSession } from '@/lib/services';
import { cn } from '@/lib/utils';
import { useMyAccess } from '../access/access';
import { formatInstant, myFeedQueryKey } from '../announcements/labels';
import { certificatesQueryKey } from '../medical/labels';
import { myPatrolsQueryKey } from '../patrols/labels';
import { plannedQueryKey } from '../scheduling/query-keys';
import { currentMonth } from '../time-tracking/labels';
import {
  adjustmentsQueryKey,
  timeEntriesQueryKey,
  timesheetQueryKey,
} from '../time-tracking/query-keys';

/** Relógio que muda a cada minuto (a tela de registro mostra os segundos). */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const WITH_BREAK = ['Entrada', 'Início do intervalo', 'Fim do intervalo', 'Saída'];
const WITHOUT_BREAK = ['Entrada', 'Saída'];
const SHORT: Record<string, string> = {
  'Início do intervalo': 'Intervalo',
  'Fim do intervalo': 'Retorno',
};

/**
 * Rótulos das marcações do dia pela escala (com intervalo: 4; sem: 2). Marcações além do
 * previsto aparecem numeradas. É só orientação visual: o sistema não classifica marcações.
 */
function daySlots(planned: PlannedDay | undefined, entries: readonly TimeEntry[]) {
  const base = (planned?.shift?.breakMinutes ?? 0) > 0 ? WITH_BREAK : WITHOUT_BREAK;
  const total = Math.max(base.length, entries.length + (entries.length % 2));
  return Array.from({ length: total }, (_, i) => ({
    label: base[i] ?? `Marcação ${String(i + 1)}`,
    entry: entries[i] ?? null,
  }));
}

function nextActionLabel(slots: ReturnType<typeof daySlots>, count: number): string {
  const next = slots[count]?.label;
  if (!next || next.startsWith('Marcação')) {
    return count % 2 === 0 ? 'Registrar entrada' : 'Registrar saída';
  }
  return `Registrar ${next.charAt(0).toLowerCase()}${next.slice(1)}`;
}

/** Início do funcionário: o ponto de hoje, a escala, os números do mês e os comunicados. */
export function MyHomePage() {
  const api = useApi();
  const session = useSession();
  const now = useMinuteClock();
  const today = todayIso();
  const month = currentMonth();
  const firstName = session.status === 'authenticated' ? session.user.name.split(' ')[0] : '';

  const entries = useQuery({
    queryKey: [...timeEntriesQueryKey, 'me', today],
    queryFn: () => api.time.mine(today, today),
  });
  const employee = useQuery({ queryKey: ['me', 'employee'], queryFn: () => api.employees.mine() });
  const planned = useQuery({
    queryKey: [...plannedQueryKey, 'me', 'home', today],
    queryFn: () => api.schedule.mine(today, addDaysIso(today, 13)),
  });
  const timesheet = useQuery({
    queryKey: [...timesheetQueryKey, 'me', month],
    queryFn: () => api.time.myTimesheet(month),
  });
  const adjustments = useQuery({
    queryKey: [...adjustmentsQueryKey, 'me'],
    queryFn: () => api.adjustments.mine(),
  });
  const certificates = useQuery({
    queryKey: [...certificatesQueryKey, 'me'],
    queryFn: () => api.medicalCertificates.mine(),
  });
  const feed = useQuery({ queryKey: myFeedQueryKey, queryFn: () => api.announcements.feed() });

  const effective = (entries.data ?? []).filter((e) => e.kind !== 'disregard' && !e.disregarded);
  const plannedToday = planned.data?.find((d) => d.date === today);
  const slots = daySlots(plannedToday, effective);
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const date = formatLongToday(now);
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
  const openRequests =
    (adjustments.data?.filter((a) => a.status === 'pending').length ?? 0) +
    (certificates.data?.filter((c) => c.status === 'pending').length ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* Ponto de hoje */}
          <section
            aria-labelledby="ponto-hoje"
            className="rounded-2xl bg-primary p-5 text-primary-foreground md:p-8"
          >
            <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,20rem)] md:items-start">
              <div className="text-center md:text-left">
                <h1 id="ponto-hoje" className="font-sans text-sm font-normal text-white/80">
                  Olá, {firstName} · {date}
                </h1>
                <p
                  className="mt-2 font-display text-6xl font-bold tabular-nums md:text-8xl"
                  aria-label={`Agora são ${time}`}
                >
                  {time}
                </p>
                {employee.data ? (
                  <p className="mt-2 flex items-center justify-center gap-2 text-sm text-white/85 md:justify-start">
                    <MapPinIcon className="size-4" aria-hidden="true" />
                    {employee.data.unit.name}
                  </p>
                ) : null}
                <Button
                  asChild
                  size="lg"
                  className="mt-5 w-full bg-card font-semibold text-primary hover:bg-card/90 md:w-auto"
                >
                  <Link to="/ponto">{nextActionLabel(slots, effective.length)}</Link>
                </Button>
              </div>

              <div>
                <h2 className="mb-2 hidden font-sans text-sm font-semibold tracking-normal md:block">
                  Marcações de hoje
                </h2>
                {entries.isPending ? (
                  <Skeleton className="h-40 w-full bg-white/10" />
                ) : (
                  <ul
                    className={cn(
                      'grid gap-2 md:grid-cols-1',
                      slots.length > 2 ? 'grid-cols-4' : 'grid-cols-2',
                    )}
                    aria-label="Marcações de hoje"
                  >
                    {slots.map(({ label, entry }) => (
                      <li
                        key={label}
                        className={cn(
                          'flex flex-col items-center justify-between gap-0.5 rounded-lg px-2 py-2 text-center md:flex-row md:px-4 md:py-3 md:text-left',
                          entry ? 'bg-black/20' : 'border border-dashed border-white/35',
                        )}
                      >
                        <span className="text-xs text-white/85 md:text-sm md:text-white">
                          <span className="md:hidden">{SHORT[label] ?? label}</span>
                          <span className="hidden md:inline">{label}</span>
                        </span>
                        <span className="font-mono text-sm font-medium md:text-base">
                          {entry ? entry.localTime : <span className="text-white/70">—</span>}
                          <span className="sr-only">{entry ? '' : 'pendente'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Números do mês */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
            <StatCard
              label={`Horas em ${monthName}`}
              value={timesheet.data ? formatMinutes(timesheet.data.totals.workedMinutes) : '—'}
              loading={timesheet.isPending}
            />
            <StatCard
              label="Previstas no mês"
              value={timesheet.data ? formatMinutes(timesheet.data.totals.plannedMinutes) : '—'}
              loading={timesheet.isPending}
            />
            <StatCard
              className="col-span-2 sm:col-span-1"
              label="Pedidos em análise"
              value={openRequests}
              note="Ajustes de ponto e atestados"
              loading={adjustments.isPending || certificates.isPending}
            />
          </div>

          {/* Atalhos */}
          <section aria-labelledby="atalhos" className="space-y-3">
            <h2 id="atalhos" className="text-xl font-bold">
              Atalhos
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Shortcut to="/meus-atestados" icon={FileTextIcon} label="Enviar atestado" />
              <Shortcut to="/ponto/espelho" icon={ClockIcon} label="Solicitar ajuste" />
              <Shortcut to="/beneficios" icon={GiftIcon} label="Meus benefícios" />
              <Shortcut to="/beneficios#links" icon={LinkIcon} label="Links úteis" />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <NextPatrolCard />
          <ScheduleCard days={planned.data} today={today} loading={planned.isPending} />
          <AnnouncementsCard items={feed.data?.items} loading={feed.isPending} />
        </div>
      </div>
    </div>
  );
}

function Shortcut({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-24 flex-col justify-between gap-4 rounded-xl border bg-card p-4 text-sm font-semibold transition-colors outline-none hover:border-primary/40 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Icon className="size-5 text-primary" aria-hidden="true" />
      {label}
    </Link>
  );
}

function shiftText(day: PlannedDay): string {
  if (day.holiday) return `Feriado: ${day.holiday.name}`;
  if (day.shift) return `${day.shift.name} · ${day.shift.start}–${day.shift.end}`;
  if (day.unassigned) return 'Sem escala vinculada';
  if (day.flexibleWeeklyMinutes !== null) return 'Jornada flexível';
  return 'Folga';
}

function ScheduleCard({
  days,
  today,
  loading,
}: {
  days: PlannedDay[] | undefined;
  today: string;
  loading: boolean;
}) {
  const current = days?.find((d) => d.date === today);
  const next = days?.find((d) => d.date > today && d.shift && !d.holiday);
  return (
    <section aria-labelledby="minha-escala" className="rounded-2xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="minha-escala" className="text-xl font-bold">
          Minha escala
        </h2>
        <Link to="/minha-escala" className="text-sm font-semibold text-primary underline">
          Ver escala
        </Link>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : (
        <dl className="mt-3 grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Hoje</dt>
            <dd className="font-semibold">
              {current ? shiftText(current) : 'Sem escala vinculada'}
            </dd>
          </div>
          {next?.shift ? (
            <div>
              <dt className="text-muted-foreground">Próximo turno</dt>
              <dd className="font-semibold">
                {formatDayLabel(next.date)} · {next.shift.start}–{next.shift.end}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}

function AnnouncementsCard({
  items,
  loading,
}: {
  items: MyAnnouncement[] | undefined;
  loading: boolean;
}) {
  const needsAck = (a: MyAnnouncement) => a.requiresAcknowledgment && !a.acknowledgedAt;
  // Ciência pendente primeiro; depois os mais recentes.
  const shown = [...(items ?? [])]
    .sort((a, b) => Number(needsAck(b)) - Number(needsAck(a)))
    .slice(0, 4);
  return (
    <section aria-labelledby="comunicados-inicio" className="rounded-2xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="comunicados-inicio" className="text-xl font-bold">
          Comunicados
        </h2>
        <Link to="/comunicados" className="text-sm font-semibold text-primary underline">
          Ver todos
        </Link>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum comunicado para você.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {shown.map((item) =>
            needsAck(item) ? (
              <li
                key={item.id}
                className="rounded-lg border border-warning-border bg-warning-soft p-3"
              >
                <Badge variant="warning" className="bg-card">
                  Ciência pendente
                </Badge>
                <p className="mt-2 text-sm font-semibold">{item.title}</p>
                <Link
                  to={`/comunicados?id=${item.id}`}
                  className="mt-1 inline-block text-sm font-semibold text-primary underline"
                >
                  Ler e confirmar
                  <span className="sr-only">: {item.title}</span>
                </Link>
              </li>
            ) : (
              <li key={item.id} className="px-1">
                <Link
                  to={`/comunicados?id=${item.id}`}
                  className="text-sm font-semibold hover:underline"
                >
                  {item.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {formatInstant(item.publishedAt)}
                  {item.viewedAt ? '' : ' · não lido'}
                </p>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** Próxima ronda (ou a em andamento) de quem tem rota atribuída. */
function NextPatrolCard() {
  const api = useApi();
  const access = useMyAccess();
  const enabled = access.data?.hasPatrolRoutes ?? false;
  const mine = useQuery({
    queryKey: myPatrolsQueryKey,
    queryFn: () => api.patrols.mine(),
    enabled,
  });
  if (!enabled) return null;
  if (mine.isPending) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const current = mine.data?.current;
  const next = mine.data?.routes
    .flatMap((route) => route.slots.map((slot) => ({ route, slot })))
    .filter(({ slot }) => slot.status === 'upcoming')
    .sort((a, b) => a.slot.at.localeCompare(b.slot.at))[0];
  const route = next?.route ?? mine.data?.routes[0];

  return (
    <section aria-labelledby="proxima-ronda" className="rounded-2xl border bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="proxima-ronda" className="text-xl font-bold">
          {current ? 'Ronda em andamento' : 'Próxima ronda'}
        </h2>
        {!current && next ? (
          <Badge variant="soft" className="font-mono">
            {next.slot.localTime}
          </Badge>
        ) : null}
      </div>
      {current ? (
        <p className="mt-2 text-sm">
          <span className="font-semibold">{current.route.name}</span>
          <span className="block text-muted-foreground">
            {current.checked} de {current.total} pontos
            {current.nextPoint ? ` · próximo: ${current.nextPoint.name}` : ''}
          </span>
        </p>
      ) : route ? (
        <p className="mt-2 text-sm">
          <span className="font-semibold">{route.name}</span>
          <span className="block text-muted-foreground">
            {route.pointsCount} pontos · previsão de {route.expectedMinutes} min
          </span>
        </p>
      ) : null}
      <Button asChild className="mt-4 w-full">
        <Link to="/rondas">
          <QrCodeIcon />
          {current ? 'Continuar e ler QR code' : 'Iniciar e ler QR code'}
        </Link>
      </Button>
    </section>
  );
}
