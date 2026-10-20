import type { Employee } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlusIcon, PlusIcon, UserPlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
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
  const [linking, setLinking] = useState(false);
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setLinking(true)} disabled={linking}>
              <UserPlusIcon />
              Adicionar já cadastrado
            </Button>
            <Button asChild>
              <Link to={`/pessoas/novo?posto=${unitId}`}>
                <PlusIcon />
                Novo funcionário
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
      {linking ? <LinkEmployeePanel unitId={unitId} onClose={() => setLinking(false)} /> : null}
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

/**
 * Busca um funcionário já cadastrado (de outro posto) e o traz para este posto. Quem está numa
 * escala do posto antigo precisa trocar de escala antes; a API explica quando for o caso.
 */
function LinkEmployeePanel({ unitId, onClose }: { unitId: string; onClose: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const term = search.trim();
  const found = useQuery({
    queryKey: [...employeesQueryKey, 'link', term],
    queryFn: () => api.employees.list({ search: term, status: 'active', pageSize: 20 }),
    enabled: term.length >= 2,
  });
  const candidates = found.data?.items.filter((e) => e.unit.id !== unitId) ?? [];

  const move = async (employee: Employee) => {
    const name = employee.socialName ?? employee.name;
    if (!window.confirm(`Trazer ${name} do posto "${employee.unit.name}" para este posto?`)) return;
    setError(null);
    setMoving(employee.id);
    try {
      await api.employees.moveToUnit(employee.id, { unitId });
      await queryClient.invalidateQueries({ queryKey: employeesQueryKey });
      toast.success(`${name} agora está neste posto.`);
    } catch (err) {
      setError(err);
    } finally {
      setMoving(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>Adicionar funcionário já cadastrado</CardTitle>
          <CardDescription>
            Busque pelo nome, matrícula ou CPF. O funcionário sai do posto atual e passa a ser
            deste.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
          <XIcon />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          aria-label="Buscar funcionário já cadastrado"
          placeholder="Digite ao menos 2 letras"
          className="max-w-sm"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
        {found.isError ? <Alert variant="destructive">{errorMessage(found.error)}</Alert> : null}
        {term.length < 2 ? null : found.isPending ? (
          <Skeleton className="h-6 w-full" />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum funcionário ativo de outro posto encontrado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Posto atual</TableHead>
                <TableHead className="sr-only">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">
                    {employee.socialName ?? employee.name}
                  </TableCell>
                  <TableCell>{employee.registrationNumber}</TableCell>
                  <TableCell>{employee.unit.name}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={moving !== null}
                      onClick={() => void move(employee)}
                    >
                      {moving === employee.id ? <Spinner /> : <UserPlusIcon />}
                      Trazer para este posto
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
