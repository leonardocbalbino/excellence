import type { PatrolOccurrenceStatus } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { errorMessage, useApi } from '@/lib/services';
import { currentMonth } from '../time-tracking/labels';
import { OccurrenceCard } from './occurrence-card';
import { occurrencesQueryKey } from './occurrence-keys';

/** Ocorrências das rondas de todos os postos no escopo, com a resolução (ADR 0024). */
export function OccurrencesPage() {
  const api = useApi();
  const [status, setStatus] = useState<PatrolOccurrenceStatus | 'all'>('open');
  const [month, setMonth] = useState('');
  const list = useQuery({
    queryKey: [...occurrencesQueryKey, 'list', status, month],
    queryFn: () =>
      api.patrols.occurrences({
        ...(status === 'all' ? {} : { status }),
        ...(month ? { month } : {}),
      }),
    refetchInterval: 30_000,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ocorrências</h1>
        <p className="max-w-3xl text-muted-foreground">
          O que os funcionários registraram durante as rondas, com foto. Cada ocorrência vai por
          e-mail aos destinatários do posto (cadastrados na pasta do posto, em Dados do posto).
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="occurrence-status">Situação</Label>
          <Select
            id="occurrence-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PatrolOccurrenceStatus | 'all')}
          >
            <option value="open">Em aberto</option>
            <option value="resolved">Resolvidas</option>
            <option value="all">Todas</option>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="occurrence-month">Mês</Label>
          <Input
            id="occurrence-month"
            type="month"
            className="w-48"
            max={currentMonth()}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>
      {list.isError ? <Alert variant="destructive">{errorMessage(list.error)}</Alert> : null}
      {list.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : list.data?.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">Nenhuma ocorrência.</Card>
      ) : (
        <div className="grid gap-3">
          {list.data?.map((occurrence) => (
            <OccurrenceCard key={occurrence.id} occurrence={occurrence} />
          ))}
        </div>
      )}
    </div>
  );
}
