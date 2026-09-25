import { ApiError } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { addDaysIso, formatDate, todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { PlannedDays } from './planned-days';
import { plannedQueryKey } from './query-keys';

const PERIOD = 14;

export function MySchedulePage() {
  const api = useApi();
  const today = todayIso();
  const [from, setFrom] = useState(today);
  const to = addDaysIso(from, PERIOD - 1);
  const planned = useQuery({
    queryKey: [...plannedQueryKey, 'me', from],
    queryFn: () => api.schedule.mine(from, to),
  });
  const notLinked = planned.error instanceof ApiError && planned.error.status === 404;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Minha escala</h1>
        <p className="text-muted-foreground">
          {formatDate(from)} a {formatDate(to)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setFrom(addDaysIso(from, -PERIOD))}>
          <ChevronLeftIcon />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFrom(today)}
          disabled={from === today}
        >
          Hoje
        </Button>
        <Button variant="outline" size="sm" onClick={() => setFrom(addDaysIso(from, PERIOD))}>
          Próxima
          <ChevronRightIcon />
        </Button>
      </div>
      {planned.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : notLinked ? (
        <Alert>
          Seu usuário ainda não está ligado a um cadastro de funcionário. Fale com o RH.
        </Alert>
      ) : planned.data ? (
        <PlannedDays days={planned.data} today={today} />
      ) : (
        <Alert variant="destructive">{errorMessage(planned.error)}</Alert>
      )}
    </div>
  );
}
