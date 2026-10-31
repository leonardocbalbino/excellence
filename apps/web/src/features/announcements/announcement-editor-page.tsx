import { type Announcement, type AnnouncementInput, ApiError } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
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
import { Textarea } from '@/components/ui/textarea';
import { errorMessage, useApi } from '@/lib/services';
import { departmentsQueryKey, unitsQueryKey } from '../organization/query-keys';
import {
  ANNOUNCEMENT_STATUS,
  announcementsQueryKey,
  audienceLabel,
  formatInstant,
  fromLocalInput,
  toLocalInput,
} from './labels';

export function AnnouncementEditorPage() {
  const { id } = useParams();
  const api = useApi();
  const announcement = useQuery({
    queryKey: [...announcementsQueryKey, 'manage', 'item', id],
    queryFn: () => api.announcements.get(id ?? ''),
    enabled: Boolean(id),
  });

  if (id && !announcement.data) {
    return announcement.isError ? (
      <Alert variant="destructive">{errorMessage(announcement.error)}</Alert>
    ) : (
      <Skeleton className="h-96 w-full" />
    );
  }
  const current = announcement.data ?? null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {current && current.status !== 'draft' ? (
        <PublishedView announcement={current} />
      ) : (
        <DraftForm key={current?.id ?? 'new'} announcement={current} />
      )}
    </div>
  );
}

function DraftForm({ announcement }: { announcement: Announcement | null }) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const units = useQuery({ queryKey: unitsQueryKey, queryFn: () => api.units.list() });
  const departments = useQuery({
    queryKey: departmentsQueryKey,
    queryFn: () => api.departments.list(),
  });
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [requiresAck, setRequiresAck] = useState(announcement?.requiresAcknowledgment ?? false);
  const [expiresAt, setExpiresAt] = useState(toLocalInput(announcement?.expiresAt ?? null));
  const [unitIds, setUnitIds] = useState(announcement?.audience.units.map((u) => u.id) ?? []);
  const [departmentIds, setDepartmentIds] = useState(
    announcement?.audience.departments.map((d) => d.id) ?? [],
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | 'delete' | null>(null);

  const input = (): AnnouncementInput => ({
    title,
    body,
    requiresAcknowledgment: requiresAck,
    expiresAt: fromLocalInput(expiresAt),
    audience: { unitIds, departmentIds },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: announcementsQueryKey });

  const run = async (action: 'save' | 'publish' | 'delete') => {
    setError(null);
    setFieldErrors({});
    setBusy(action);
    try {
      if (action === 'delete' && announcement) {
        await api.announcements.remove(announcement.id);
        await refresh();
        toast.success('Rascunho excluído.');
        await navigate('/gestao/comunicados');
        return;
      }
      const saved = announcement
        ? await api.announcements.update(announcement.id, input())
        : await api.announcements.create(input());
      if (action === 'publish') {
        await api.announcements.publish(saved.id);
        toast.success('Comunicado publicado.');
      } else {
        toast.success('Rascunho salvo.');
      }
      await refresh();
      await navigate(`/gestao/comunicados/${saved.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) setFieldErrors(e.fieldErrors);
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (list: string[], set: (next: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{announcement ? 'Editar rascunho' : 'Novo comunicado'}</CardTitle>
        <CardDescription>
          Depois de publicado, o texto e o público não podem ser alterados.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FormField label="Título" error={fieldErrors.title}>
          {(props) => <Input {...props} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </FormField>
        <FormField label="Texto" error={fieldErrors.body}>
          {(props) => (
            <Textarea {...props} rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          )}
        </FormField>
        <div className="flex items-center gap-2">
          <Checkbox
            id="announcement-ack"
            checked={requiresAck}
            onCheckedChange={(checked) => setRequiresAck(checked === true)}
          />
          <Label htmlFor="announcement-ack">Pedir confirmação &quot;li e estou ciente&quot;</Label>
        </div>
        <FormField
          label="Sai do mural em (opcional)"
          hint="Continua disponível aqui e nos relatórios."
          error={fieldErrors.expiresAt}
        >
          {(props) => (
            <Input
              {...props}
              type="datetime-local"
              className="sm:w-64"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          )}
        </FormField>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Público</legend>
          <p className="text-sm text-muted-foreground">
            Sem nada marcado, vai para toda a empresa. Marcando, vai para quem está lotado em alguma
            dos postos de trabalho ou dos departamentos.
          </p>
          {fieldErrors.audience ? (
            <p className="text-sm text-destructive">{fieldErrors.audience}</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <span className="text-sm font-medium">Postos de trabalho</span>
              {units.data?.map((unit) => (
                <div key={unit.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`unit-${unit.id}`}
                    checked={unitIds.includes(unit.id)}
                    onCheckedChange={() => toggle(unitIds, setUnitIds, unit.id)}
                  />
                  <Label htmlFor={`unit-${unit.id}`}>{unit.name}</Label>
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Departamentos</span>
              {departments.data?.map((department) => (
                <div key={department.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`department-${department.id}`}
                    checked={departmentIds.includes(department.id)}
                    onCheckedChange={() => toggle(departmentIds, setDepartmentIds, department.id)}
                  />
                  <Label htmlFor={`department-${department.id}`}>{department.name}</Label>
                </div>
              ))}
            </div>
          </div>
        </fieldset>

        {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void run('save')} disabled={busy !== null}>
            {busy === 'save' ? <Spinner /> : null}
            Salvar rascunho
          </Button>
          <Button onClick={() => void run('publish')} disabled={busy !== null}>
            {busy === 'publish' ? <Spinner /> : <SendIcon />}
            Publicar
          </Button>
          {announcement ? (
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={() => void run('delete')}
              disabled={busy !== null}
            >
              {busy === 'delete' ? <Spinner /> : <Trash2Icon />}
              Excluir rascunho
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PublishedView({ announcement }: { announcement: Announcement }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const receipts = useQuery({
    queryKey: [...announcementsQueryKey, 'receipts', announcement.id],
    queryFn: () => api.announcements.receipts(announcement.id),
  });
  const archive = useMutation({
    mutationFn: () => api.announcements.archive(announcement.id),
    onSuccess: async () => {
      toast.success('Comunicado arquivado.');
      await queryClient.invalidateQueries({ queryKey: announcementsQueryKey });
    },
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle>{announcement.title}</CardTitle>
            <Badge variant={announcement.status === 'published' ? 'default' : 'secondary'}>
              {ANNOUNCEMENT_STATUS[announcement.status]}
            </Badge>
          </div>
          <CardDescription>
            {announcement.publishedAt
              ? `Publicado em ${formatInstant(announcement.publishedAt)} · `
              : ''}
            {audienceLabel(announcement.audience)}
            {announcement.expiresAt
              ? ` · sai do mural em ${formatInstant(announcement.expiresAt)}`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="whitespace-pre-wrap">{announcement.body}</p>
          {archive.isError ? (
            <Alert variant="destructive">{errorMessage(archive.error)}</Alert>
          ) : null}
          {announcement.status === 'published' ? (
            <div>
              <Button
                variant="outline"
                onClick={() => archive.mutate()}
                disabled={archive.isPending}
              >
                {archive.isPending ? <Spinner /> : <ArchiveIcon />}
                Arquivar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leituras</CardTitle>
          <CardDescription>
            Funcionários do público ativos na publicação, dentro do seu escopo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {receipts.isError ? (
            <Alert variant="destructive">{errorMessage(receipts.error)}</Alert>
          ) : receipts.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Lotação</TableHead>
                  <TableHead>Leu</TableHead>
                  {announcement.requiresAcknowledgment ? <TableHead>Ciente</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.data.map((receipt) => (
                  <TableRow key={receipt.employee.id}>
                    <TableCell>
                      {receipt.employee.name}
                      <span className="block text-xs text-muted-foreground">
                        {receipt.employee.registrationNumber}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[receipt.unit, receipt.department].filter(Boolean).join(' · ')}
                    </TableCell>
                    <TableCell>
                      {receipt.hasAccount
                        ? receipt.viewedAt
                          ? formatInstant(receipt.viewedAt)
                          : '—'
                        : 'Sem acesso ao sistema'}
                    </TableCell>
                    {announcement.requiresAcknowledgment ? (
                      <TableCell>
                        {receipt.acknowledgedAt ? formatInstant(receipt.acknowledgedAt) : '—'}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
