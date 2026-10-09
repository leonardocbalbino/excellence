import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';

const NOTE_TONES = {
  muted: 'text-muted-foreground',
  primary: 'font-semibold text-primary',
  warning: 'font-semibold text-warning',
} as const;

/** Indicador do painel: rótulo, número grande e uma observação opcional. */
export function StatCard({
  label,
  value,
  suffix,
  note,
  tone = 'muted',
  loading = false,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Complemento menor ao lado do número (ex.: "/ 168"). */
  suffix?: ReactNode;
  note?: ReactNode;
  tone?: keyof typeof NOTE_TONES;
  loading?: boolean;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 md:p-5', className)}>
      <h2 className="font-sans text-sm font-normal tracking-normal text-muted-foreground">
        {label}
      </h2>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-20" />
      ) : (
        <p className="mt-1 font-display text-3xl font-bold tabular-nums md:text-4xl">
          {value}
          {suffix ? (
            <span className="ml-1 text-lg font-semibold text-muted-foreground md:text-xl">
              {suffix}
            </span>
          ) : null}
        </p>
      )}
      {note && !loading ? (
        <p className={cn('mt-2 text-xs md:text-sm', NOTE_TONES[tone])}>{note}</p>
      ) : null}
    </section>
  );
}
