import { formatCpf } from '@excellence/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FileUpIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useCan } from '../access/access';
import { unitsQueryKey } from '../organization/query-keys';
import { employeesQueryKey } from './query-keys';

const PAGE_SIZE = 25;

export function EmployeesPage() {
  const api = useApi();
  const canManage = useCan('employees:manage');
  const canImport = useCan('employees:import');
  const canReadUnits = useCan('units:read');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    unitId: '',
    status: 'active' as 'active' | 'terminated' | 'all',
    page: 1,
  });
  const units = useQuery({
    queryKey: [...unitsQueryKey, 'options'],
    queryFn: () => api.units.list(),
    enabled: canReadUnits,
  });
  const employees = useQuery({
    queryKey: [...employeesQueryKey, filters],
    queryFn: () =>
      api.employees.list({
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.unitId ? { unitId: filters.unitId } : {}),
        status: filters.status,
        page: filters.page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const totalPages = Math.max(1, Math.ceil((employees.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Funcionários</h1>
          <p className="text-muted-foreground">Pessoas no escopo do seu perfil.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canImport ? (
            <Button asChild variant="outline">
              <Link to="/pessoas/importar">
                <FileUpIcon />
                Importar planilha
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button asChild>
              <Link to="/pessoas/novo">
                <PlusIcon />
                Novo funcionário
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((f) => ({ ...f, search: search.trim(), page: 1 }));
        }}
      >
        <div className="grid w-full gap-2 sm:w-72">
          <Label htmlFor="employee-search">Buscar</Label>
          <Input
            id="employee-search"
            placeholder="Nome, matrícula ou CPF"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {canReadUnits ? (
          <div className="grid w-full gap-2 sm:w-56">
            <Label htmlFor="employee-unit">Unidade</Label>
            <Select
              id="employee-unit"
              value={filters.unitId}
              onChange={(event) =>
                setFilters((f) => ({ ...f, unitId: event.target.value, page: 1 }))
              }
            >
              <option value="">Todas</option>
              {units.data?.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="grid w-full gap-2 sm:w-44">
          <Label htmlFor="employee-status">Situação</Label>
          <Select
            id="employee-status"
            value={filters.status}
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                status: event.target.value as typeof f.status,
                page: 1,
              }))
            }
          >
            <option value="active">Ativos</option>
            <option value="terminated">Desligados</option>
            <option value="all">Todos</option>
          </Select>
        </div>
        <Button type="submit" variant="outline">
          <SearchIcon />
          Buscar
        </Button>
      </form>

      {employees.isError ? (
        <Alert variant="destructive">{errorMessage(employees.error)}</Alert>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Cargo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.isPending ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : employees.data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum funcionário encontrado.
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
                  <TableCell className="whitespace-nowrap">{formatCpf(employee.cpf)}</TableCell>
                  <TableCell>{employee.unit.name}</TableCell>
                  <TableCell>{employee.position?.name ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {employees.data && employees.data.total > PAGE_SIZE ? (
        <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {employees.data.total} funcionários · página {filters.page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Próxima
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
