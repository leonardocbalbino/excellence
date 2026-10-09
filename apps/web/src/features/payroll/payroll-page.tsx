import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalculatorIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { currentMonth, monthLabel, shiftMonth } from '../time-tracking/labels';
import { payrollQueryKey } from './labels';
import { PayrollStatusBadge } from './status-badge';

/**
 * Fechamento mensal: o RH consolida o mês, publica a prévia para os funcionários e exporta
 * o arquivo para o escritório de contabilidade, que calcula a folha.
 */
export function PayrollPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Padrão: o mês anterior (o fechamento costuma ser feito no começo do mês seguinte).
  const [month, setMonth] = useState(() => shiftMonth(currentMonth(), -1));
  const periods = useQuery({ queryKey: payrollQueryKey, queryFn: () => api.payroll.list() });
  const generate = useMutation({
    mutationFn: () => api.payroll.generate(month),
    onSuccess: async (period) => {
      await queryClient.invalidateQueries({ queryKey: payrollQueryKey });
      void navigate(`/gestao/folha/${period.id}`);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Folha de pagamento</h1>
        <p className="max-w-3xl text-muted-foreground">
          Feche o mês com o ponto, os atestados, o salário do cargo e os benefícios de cada
          funcionário. Publique a prévia para os funcionários conferirem e exporte o arquivo para o
          escritório de contabilidade, que calcula impostos, encargos e o holerite.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          generate.mutate();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="payroll-month">Mês</Label>
          <Input
            id="payroll-month"
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => setMonth(e.target.value)}
            className="w-48"
          />
        </div>
        <Button type="submit" disabled={!month || generate.isPending}>
          {generate.isPending ? <Spinner /> : <CalculatorIcon />}
          Gerar fechamento
        </Button>
        <p className="text-sm text-muted-foreground">
          Se o mês já existir e não estiver fechado, os números são recalculados.
        </p>
        {generate.isError ? (
          <Alert variant="destructive" className="basis-full">
            {errorMessage(generate.error)}
          </Alert>
        ) : null}
      </form>

      {periods.isError ? <Alert variant="destructive">{errorMessage(periods.error)}</Alert> : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Funcionários</TableHead>
              <TableHead>Contado até</TableHead>
              <TableHead>Gerado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {periods.isPending ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : periods.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum fechamento ainda.
                </TableCell>
              </TableRow>
            ) : (
              periods.data?.map((period) => (
                <TableRow key={period.id}>
                  <TableCell>
                    <Link
                      to={`/gestao/folha/${period.id}`}
                      className="font-semibold text-primary capitalize hover:underline"
                    >
                      {monthLabel(period.month)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PayrollStatusBadge status={period.status} />
                  </TableCell>
                  <TableCell>{period.employees}</TableCell>
                  <TableCell>{formatDate(period.cutoffDate)}</TableCell>
                  <TableCell>{new Date(period.generatedAt).toLocaleString('pt-BR')}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
