import type { Adjustment, Announcement, MedicalCertificate } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { StatCard } from '@/components/ui/stat-card';
import { formatLongToday, todayIso } from '@/lib/format';
import { errorMessage, useApi, useSession } from '@/lib/services';
import { cn } from '@/lib/utils';
import { useCan } from '../access/access';
import { announcementsQueryKey } from '../announcements/labels';
import { certificatePeriod, certificatesQueryKey } from '../medical/labels';
import { patrolBoardQueryKey } from '../patrols/labels';
import { RunProgressList } from '../patrols/run-progress';
import { byUnit, dailyAttendanceQueryKey, summarize } from '../time-tracking/attendance';
import { adjustmentsQueryKey } from '../time-tracking/query-keys';

const HOUR = 3_600_000;

interface Pending {
  id: string;
  employee: string;
  kind: string;
  reference: string;
  createdAt: string;
  to: string;
}

function fromAdjustment(a: Adjustment): Pending {
  const reference =
    a.type === 'include'
      ? `Incluir ${a.proposedLocal ?? ''}`
      : `Desconsiderar ${a.targetEntry ? `${a.targetEntry.localDate} ${a.targetEntry.localTime}` : ''}`;
  return {
    id: a.id,
    employee: a.employee.name,
    kind: 'Ajuste de ponto',
    reference: reference.trim(),
    createdAt: a.createdAt,
    to: '/ponto/ajustes',
  };
}

function fromCertificate(c: MedicalCertificate): Pending {
  return {
    id: c.id,
    employee: c.employee.name,
    kind: 'Atestado médico',
    reference: certificatePeriod(c),
    createdAt: c.createdAt,
    to: '/atestados',
  };
}

function ageBadge(createdAt: string, now: number) {
  const days = Math.floor((now - new Date(createdAt).getTime()) / (24 * HOUR));
  if (days <= 0) return <Badge variant="soft">Hoje</Badge>;
  return (
    <Badge variant={days >= 2 ? 'warning' : 'soft'}>
      Há {days} {days === 1 ? 'dia' : 'dias'}
    </Badge>
  );
}

/**
 * Visão geral da gestão: presença do dia, pedidos aguardando decisão e ciências de
 * comunicados. Cada bloco só aparece com a permissão do módulo e respeita o escopo do perfil
 * (o gestor vê a equipe; RH e Administrador, a empresa). O próprio ponto de quem consulta
 * não entra aqui: fica na área pessoal.
 */
export function OverviewPage() {
  const api = useApi();
  const session = useSession();
  const today = todayIso();
  // Idade dos pedidos medida a partir de quando a tela abriu (render puro).
  const [now] = useState(() => Date.now());
  const canSeeTime = useCan('time_entries:read');
  const canApprove = useCan('time_adjustments:approve');
  const canReview = useCan('medical_certificates:review');
  const canAnnounce = useCan('announcements:manage');
  const canSeePatrols = useCan('patrols:read');

  const attendance = useQuery({
    queryKey: [...dailyAttendanceQueryKey, today],
    queryFn: () => api.time.daily({ date: today }),
    enabled: canSeeTime,
    refetchInterval: 60_000,
  });
  const adjustments = useQuery({
    queryKey: [...adjustmentsQueryKey, 'pending'],
    queryFn: () => api.adjustments.toApprove('pending'),
    enabled: canApprove,
  });
  const certificates = useQuery({
    queryKey: [...certificatesQueryKey, 'list', 'pending'],
    queryFn: () => api.medicalCertificates.list({ status: 'pending' }),
    enabled: canReview,
  });
  const patrols = useQuery({
    queryKey: [...patrolBoardQueryKey, today],
    queryFn: () => api.patrols.board(today),
    enabled: canSeePatrols,
    refetchInterval: 30_000,
  });
  const activeRuns = (patrols.data?.runs ?? []).filter((r) => r.status === 'in_progress');
  const lateRuns = activeRuns.filter((r) => r.lateMinutes > 0);
  const announcements = useQuery({
    queryKey: [...announcementsQueryKey, 'manage', 'published'],
    queryFn: () => api.announcements.list('published'),
    enabled: canAnnounce,
  });

  const summary = attendance.data ? summarize(attendance.data.items, true) : null;
  const pending = [
    ...(adjustments.data ?? []).map(fromAdjustment),
    ...(certificates.data ?? []).map(fromCertificate),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const stale = pending.filter((p) => now - new Date(p.createdAt).getTime() >= 48 * HOUR);
  const pendingLoading =
    (canApprove && adjustments.isPending) || (canReview && certificates.isPending);
  const withAck = (announcements.data ?? []).filter((a) => a.requiresAcknowledgment);
  const dateLabel = formatLongToday(new Date(now));
  const firstName = session.status === 'authenticated' ? session.user.name.split(' ')[0] : '';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {dateLabel} · Olá, {firstName}
        </p>
        <h1 className="text-3xl font-bold md:text-4xl">Visão geral</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {canSeeTime ? (
          <>
            <StatCard
              label="Presentes agora"
              value={summary?.present ?? '—'}
              suffix={summary ? `/ ${String(summary.expected)}` : undefined}
              note={summary ? `${String(summary.finished)} já encerraram` : undefined}
              tone="primary"
              loading={attendance.isPending}
            />
            <StatCard
              label="Sem registro"
              value={summary?.overdue ?? '—'}
              note="Turno já começou e não houve marcação"
              tone={summary && summary.overdue > 0 ? 'warning' : 'muted'}
              loading={attendance.isPending}
            />
          </>
        ) : null}
        {canApprove || canReview ? (
          <StatCard
            label="Aprovações pendentes"
            value={pending.length}
            note={stale.length > 0 ? `${String(stale.length)} há mais de 48 h` : 'Nenhuma atrasada'}
            tone={stale.length > 0 ? 'warning' : 'muted'}
            loading={pendingLoading}
          />
        ) : null}
        {canSeePatrols ? (
          <StatCard
            label="Rondas em andamento"
            value={activeRuns.length}
            note={
              lateRuns.length > 0 ? `${String(lateRuns.length)} atrasada(s)` : 'Nenhuma atrasada'
            }
            tone={lateRuns.length > 0 ? 'warning' : 'muted'}
            loading={patrols.isPending}
          />
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        {canApprove || canReview ? (
          <section aria-labelledby="pendencias" className="rounded-2xl border bg-card p-4 md:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="pendencias" className="text-xl font-bold md:text-2xl">
                Pendências de aprovação
              </h2>
              <Link
                to={canApprove ? '/ponto/ajustes' : '/atestados'}
                className="text-sm font-semibold text-primary underline"
              >
                Ver todas
              </Link>
            </div>
            {adjustments.isError || certificates.isError ? (
              <Alert variant="destructive" className="mt-4">
                {errorMessage(adjustments.error ?? certificates.error)}
              </Alert>
            ) : null}
            {pendingLoading ? (
              <Skeleton className="mt-4 h-40 w-full" />
            ) : pending.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhum pedido aguardando sua decisão.
              </p>
            ) : (
              <PendingList items={pending.slice(0, 8)} now={now} />
            )}
          </section>
        ) : null}

        <div className="space-y-6">
          {canSeePatrols ? (
            <section
              aria-labelledby="rondas-agora"
              className="rounded-2xl border bg-card p-4 md:p-6"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="rondas-agora" className="text-xl font-bold md:text-2xl">
                  Rondas agora
                </h2>
                <Link to="/gestao/rondas" className="text-sm font-semibold text-primary underline">
                  Painel
                </Link>
              </div>
              {patrols.isError ? (
                <Alert variant="destructive" className="mt-4">
                  {errorMessage(patrols.error)}
                </Alert>
              ) : patrols.isPending ? (
                <Skeleton className="mt-4 h-24 w-full" />
              ) : (
                <RunProgressList runs={activeRuns} />
              )}
            </section>
          ) : null}
          {canSeeTime ? (
            <section
              aria-labelledby="ponto-agora"
              className="rounded-2xl border bg-card p-4 md:p-6"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="ponto-agora" className="text-xl font-bold md:text-2xl">
                  Ponto agora
                </h2>
                <Link to="/gestao/ponto" className="text-sm font-semibold text-primary underline">
                  Ponto do dia
                </Link>
              </div>
              {attendance.isError ? (
                <Alert variant="destructive" className="mt-4">
                  {errorMessage(attendance.error)}
                </Alert>
              ) : attendance.isPending ? (
                <Skeleton className="mt-4 h-24 w-full" />
              ) : (
                <UnitBars units={byUnit(attendance.data.items)} />
              )}
            </section>
          ) : null}

          {canAnnounce ? (
            <section aria-labelledby="ciencias" className="rounded-2xl border bg-card p-4 md:p-6">
              <h2 id="ciencias" className="text-xl font-bold md:text-2xl">
                Ciências de comunicados
              </h2>
              {announcements.isPending ? (
                <Skeleton className="mt-4 h-20 w-full" />
              ) : withAck.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum comunicado publicado pede ciência.
                </p>
              ) : (
                <AcknowledgmentList items={withAck.slice(0, 4)} />
              )}
              <Button asChild className="mt-4">
                <Link to="/gestao/comunicados/novo">Novo comunicado</Link>
              </Button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PendingList({ items, now }: { items: Pending[]; now: number }) {
  return (
    <>
      {/* Tabela no desktop, cartões no celular. */}
      <table className="mt-4 hidden w-full border-separate border-spacing-y-2 text-sm md:table">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="px-3 font-semibold">Colaborador</th>
            <th className="px-3 font-semibold">Solicitação</th>
            <th className="px-3 font-semibold">Referência</th>
            <th className="px-3 font-semibold">Situação</th>
            <th className="px-3">
              <span className="sr-only">Ação</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="bg-background">
              <td className="rounded-l-lg px-3 py-3 font-semibold">{item.employee}</td>
              <td className="px-3 py-3">{item.kind}</td>
              <td className="px-3 py-3">{item.reference}</td>
              <td className="px-3 py-3">{ageBadge(item.createdAt, now)}</td>
              <td className="rounded-r-lg px-3 py-3 text-right">
                <Button asChild variant="outline" size="sm" className="border-primary">
                  <Link to={item.to}>
                    Analisar<span className="sr-only"> pedido de {item.employee}</span>
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-4 grid gap-2 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.to}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{item.employee}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {item.kind} · {item.reference}
                </span>
              </span>
              {ageBadge(item.createdAt, now)}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function UnitBars({ units }: { units: ReturnType<typeof byUnit> }) {
  if (units.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Ninguém escalado hoje.</p>;
  }
  return (
    <ul className="mt-4 grid gap-4">
      {units.map((unit) => {
        const ratio = unit.expected > 0 ? unit.arrived / unit.expected : 0;
        return (
          <li key={unit.id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{unit.name}</span>
              <span className="text-muted-foreground">
                {unit.arrived} de {unit.expected} marcaram
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={`Marcaram em ${unit.name}`}
              aria-valuemin={0}
              aria-valuemax={unit.expected}
              aria-valuenow={unit.arrived}
            >
              <div
                className={cn('h-full rounded-full', ratio < 0.5 ? 'bg-warning' : 'bg-primary')}
                style={{ width: `${String(Math.round(ratio * 100))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AcknowledgmentList({ items }: { items: Announcement[] }) {
  return (
    <ul className="mt-3 grid gap-3">
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          <Link to={`/gestao/comunicados/${item.id}`} className="font-semibold hover:underline">
            {item.title}
          </Link>
          <p className="text-muted-foreground">
            {item.stats.acknowledged} confirmaram · {item.stats.viewed} leram
          </p>
        </li>
      ))}
    </ul>
  );
}
