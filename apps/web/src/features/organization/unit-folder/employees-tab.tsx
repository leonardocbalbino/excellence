import { useQuery } from '@tanstack/react-query';
import { FilePlusIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../../access/access';
import { employeesQueryKey } from '../../workforce/query-keys';

const PAGE_SIZE = 100;

/** Funcionários lotados no posto, com atalhos para cadastrar e anexar atestado. */
export function UnitEmployeesTab({ unitId }: { unitId: string }) {
  const api = useApi();
  const canManage = useCan('employees:manage');
  const canAttach = useCan('medical_certificates:manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'terminated' | 'all'>('active');
  const employees = useQuery({
    queryKey: [...employeesQueryKey, 'unit', unitId, { search, status }],
    queryFn: () =>
      api.employees.list({
        unitId,
        status,
        pageSize: PAGE_SIZE,
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
  });
  const back = encodeURIComponent(`/cadastros/postos/${unitId}?aba=funcionarios`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Buscar funcionário"
            placeholder="Nome, matrícula ou CPF"
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            aria-label="Situação"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="active">Ativos</option>
            <option value="terminated">Desligados</option>
            <option value="all">Todos</option>
          </Select>
        </div>
        {canManage ? (
          <Button asChild>
            <Link to={`/pessoas/novo?posto=${unitId}`}>
              <PlusIcon />
              Novo funcionário
            </Link>
          </Button>
        ) : null}
      </div>
      {employees.isError ? (
        <Alert variant="destructive">{errorMessage(employees.error)}</Alert>
      ) : null}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead>Cargo</TableHead>
              {canAttach ? <TableHead className="sr-only">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.isPending ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : employees.data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Nenhum funcionário neste posto.
                </TableCell>
              </TableRow>
            ) : (
              employees.data?.items.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <Link
                      to={`/pessoas/${employee.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {employee.socialName ?? employee.name}
                    </Link>
                    {employee.status === 'terminated' ? (
                      <Badge variant="secondary" className="ml-2">
                        Desligado
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{employee.registrationNumber}</TableCell>
                  <TableCell>{employee.position?.name ?? '—'}</TableCell>
                  {canAttach ? (
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/pessoas/${employee.id}/atestado?voltar=${back}`}>
                          <FilePlusIcon />
                          Anexar atestado
                        </Link>
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      {employees.data && employees.data.total > employees.data.items.length ? (
        <p className="text-sm text-muted-foreground">
          Mostrando {employees.data.items.length} de {employees.data.total}. Use a busca para
          encontrar os demais.
        </p>
      ) : null}
    </div>
  );
}
