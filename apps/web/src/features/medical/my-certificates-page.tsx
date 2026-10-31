import { useQuery } from '@tanstack/react-query';
import { FileTextIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { errorMessage, useApi } from '@/lib/services';
import { CERTIFICATE_STATUS, certificatePeriod, certificatesQueryKey } from './labels';

/**
 * Atestados do próprio funcionário, só para consulta: ele entrega o documento à
 * administração, que o anexa ao sistema. Aqui ele confirma que o anexo foi feito e abre o
 * documento.
 */
export function MyCertificatesPage() {
  const api = useApi();
  const certificates = useQuery({
    queryKey: [...certificatesQueryKey, 'me'],
    queryFn: () => api.medicalCertificates.mine(),
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
      <div>
        <h1 className="text-2xl font-semibold">Meus atestados</h1>
        <p className="text-muted-foreground">
          Entregue o atestado à administração. Depois que ele for anexado ao sistema, aparece aqui e
          você pode abrir o documento.
        </p>
      </div>

      {certificates.isError ? (
        <Alert variant="destructive">{errorMessage(certificates.error)}</Alert>
      ) : null}
      {certificates.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : certificates.data?.length === 0 ? (
        <Alert>Nenhum atestado anexado até agora.</Alert>
      ) : (
        <ul className="grid gap-2">
          {certificates.data?.map((certificate) => (
            <li
              key={certificate.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <span>
                <span className="font-medium">{certificatePeriod(certificate)}</span>
                <span className="block text-sm text-muted-foreground">
                  Anexado em {new Date(certificate.createdAt).toLocaleDateString('pt-BR')}
                </span>
                {certificate.reviewNote ? (
                  <span className="block text-sm text-muted-foreground">
                    Observação da administração: {certificate.reviewNote}
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
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
