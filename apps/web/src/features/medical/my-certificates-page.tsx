import type { MedicalCertificateInput } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileTextIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { errorMessage, useApi } from '@/lib/services';
import { CertificateForm } from './certificate-form';
import { CERTIFICATE_STATUS, certificatePeriod, certificatesQueryKey } from './labels';

export function MyCertificatesPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const certificates = useQuery({
    queryKey: [...certificatesQueryKey, 'me'],
    queryFn: () => api.medicalCertificates.mine(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: certificatesQueryKey });

  const submit = async (input: MedicalCertificateInput) => {
    await api.medicalCertificates.submit(input);
    await refresh();
    toast.success('Atestado enviado para análise do RH.');
    setAdding(false);
  };
  const cancel = useMutation({
    mutationFn: (id: string) => api.medicalCertificates.cancel(id),
    onSuccess: refresh,
  });
  const openDocument = async (id: string) => {
    try {
      const link = await api.medicalCertificates.myDocument(id);
      window.open(link.url, '_blank', 'noopener');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Meus atestados</h1>
          <p className="text-muted-foreground">Envie a foto ou o PDF do atestado.</p>
        </div>
        {adding ? null : (
          <Button onClick={() => setAdding(true)}>
            <PlusIcon />
            Enviar atestado
          </Button>
        )}
      </div>

      {adding ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo atestado</CardTitle>
          </CardHeader>
          <CardContent>
            <CertificateForm onSubmit={submit} onCancel={() => setAdding(false)} />
          </CardContent>
        </Card>
      ) : null}

      {certificates.isError ? (
        <Alert variant="destructive">{errorMessage(certificates.error)}</Alert>
      ) : null}
      {cancel.isError ? <Alert variant="destructive">{errorMessage(cancel.error)}</Alert> : null}
      {certificates.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : certificates.data?.length === 0 ? (
        <Alert>Nenhum atestado enviado.</Alert>
      ) : (
        <ul className="grid gap-2">
          {certificates.data?.map((certificate) => (
            <li
              key={certificate.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <span>
                <span className="font-medium">{certificatePeriod(certificate)}</span>
                {certificate.reviewNote ? (
                  <span className="block text-sm text-muted-foreground">
                    Resposta do RH: {certificate.reviewNote}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <Badge variant={certificate.status === 'accepted' ? 'default' : 'secondary'}>
                  {CERTIFICATE_STATUS[certificate.status]}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void openDocument(certificate.id)}
                  aria-label="Abrir documento"
                >
                  <FileTextIcon />
                </Button>
                {certificate.status === 'pending' ? (
                  <Button variant="ghost" size="sm" onClick={() => cancel.mutate(certificate.id)}>
                    Cancelar
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
