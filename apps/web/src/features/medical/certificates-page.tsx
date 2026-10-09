import type { MedicalCertificate, MedicalCertificateSensitive } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, DownloadIcon, ExternalLinkIcon, EyeIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { errorMessage, useApi } from '@/lib/services';
import { useCan } from '../access/access';
import { CERTIFICATE_STATUS, certificatePeriod, certificatesQueryKey } from './labels';

type StatusFilter = MedicalCertificate['status'] | 'all';

/** Atestados dos funcionários no escopo. O CID só aparece sob demanda, com leitura auditada. */
export function CertificatesPage() {
  const api = useApi();
  const [status, setStatus] = useState<StatusFilter>('pending');
  const certificates = useQuery({
    queryKey: [...certificatesQueryKey, 'list', status],
    queryFn: () => api.medicalCertificates.list(status === 'all' ? {} : { status: status }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Atestados</h1>
          <p className="text-muted-foreground">
            Análise dos atestados enviados. O efeito na folha é definido no motor de cálculo.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="certificate-status">Situação</Label>
          <Select
            id="certificate-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="pending">Em análise</option>
            <option value="accepted">Válidos</option>
            <option value="rejected">Inválidos</option>
            <option value="cancelled">Cancelados</option>
            <option value="all">Todos</option>
          </Select>
        </div>
      </div>
      {certificates.isError ? (
        <Alert variant="destructive">{errorMessage(certificates.error)}</Alert>
      ) : null}
      {certificates.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : certificates.data?.length === 0 ? (
        <Alert>Nenhum atestado nesta situação.</Alert>
      ) : (
        certificates.data?.map((certificate) => (
          <CertificateCard key={certificate.id} certificate={certificate} />
        ))
      )}
    </div>
  );
}

function CertificateCard({ certificate }: { certificate: MedicalCertificate }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const canReview = useCan('medical_certificates:review');
  const canReadSensitive = useCan('medical_certificates:read_sensitive');
  const [note, setNote] = useState('');
  const [sensitive, setSensitive] = useState<MedicalCertificateSensitive | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: certificatesQueryKey });
  const accept = useMutation({
    mutationFn: () => api.medicalCertificates.accept(certificate.id, { note: note || null }),
    onSuccess: async () => {
      toast.success('Atestado marcado como válido.');
      await refresh();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.medicalCertificates.reject(certificate.id, { note }),
    onSuccess: async () => {
      toast.success('Atestado marcado como inválido.');
      await refresh();
    },
  });
  const reveal = useMutation({
    mutationFn: () => api.medicalCertificates.sensitive(certificate.id),
    onSuccess: setSensitive,
  });
  const busy = accept.isPending || reject.isPending;
  const error = accept.error ?? reject.error ?? reveal.error;

  return (
    <Card>
      <CardContent className="grid gap-3 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link
            to={`/pessoas/${certificate.employee.id}`}
            className="font-medium text-primary hover:underline"
          >
            {certificate.employee.name}
          </Link>
          <Badge variant={certificate.status === 'accepted' ? 'default' : 'secondary'}>
            {CERTIFICATE_STATUS[certificate.status]}
          </Badge>
        </div>
        <p>{certificatePeriod(certificate)}</p>
        {certificate.issuerName || certificate.issuerRegistry ? (
          <p className="text-sm text-muted-foreground">
            Emitido por{' '}
            {[certificate.issuerName, certificate.issuerRegistry].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {certificate.notes ? (
          <p className="text-sm text-muted-foreground">Observações: {certificate.notes}</p>
        ) : null}
        {certificate.reviewNote ? (
          <p className="text-sm text-muted-foreground">Análise: {certificate.reviewNote}</p>
        ) : null}

        {canReadSensitive ? (
          sensitive ? (
            <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  CID: <strong>{sensitive.cid ?? 'não informado'}</strong>
                </span>
                <span className="ml-auto flex flex-wrap gap-2">
                  {sensitive.preview ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={sensitive.preview.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLinkIcon />
                        Abrir em nova aba
                      </a>
                    </Button>
                  ) : null}
                  <Button asChild size="sm">
                    <a href={sensitive.document.url} rel="noopener noreferrer">
                      <DownloadIcon />
                      Baixar
                    </a>
                  </Button>
                </span>
              </div>
              {sensitive.preview ? (
                sensitive.contentType === 'application/pdf' ? (
                  <iframe
                    src={sensitive.preview.url}
                    title={`Atestado de ${certificate.employee.name}`}
                    className="h-[70vh] w-full rounded-md border bg-card"
                  />
                ) : (
                  <img
                    src={sensitive.preview.url}
                    alt={`Atestado de ${certificate.employee.name}`}
                    className="max-h-[70vh] w-full rounded-md border bg-card object-contain"
                  />
                )
              ) : (
                <p className="text-muted-foreground">
                  Este formato não abre no navegador. Use “Baixar” para ver o arquivo.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                O link vale por alguns minutos. Para ver de novo depois, recarregue a página.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => reveal.mutate()}
                disabled={reveal.isPending}
              >
                {reveal.isPending ? <Spinner /> : <EyeIcon />}
                Ver atestado{certificate.hasCid ? ' e CID' : ''}
              </Button>
              <span className="text-xs text-muted-foreground">
                Dado sensível: o acesso fica registrado na auditoria.
              </span>
            </div>
          )
        ) : null}

        {canReview && certificate.status === 'pending' ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor={`review-${certificate.id}`}>
                Observação (obrigatória se inválido)
              </Label>
              <Input
                id={`review-${certificate.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => accept.mutate()} disabled={busy}>
                {accept.isPending ? <Spinner /> : <CheckIcon />}
                Válido
              </Button>
              <Button
                variant="outline"
                onClick={() => reject.mutate()}
                disabled={busy || note.trim() === ''}
              >
                {reject.isPending ? <Spinner /> : <XIcon />}
                Inválido
              </Button>
            </div>
          </>
        ) : null}
        {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
      </CardContent>
    </Card>
  );
}
