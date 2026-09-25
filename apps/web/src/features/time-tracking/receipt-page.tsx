import { formatCnpj, formatCpf } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { PrinterIcon } from 'lucide-react';
import { useParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { formatDate } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';

/**
 * Comprovante da marcação. O formato oficial exigido para o comprovante depende da
 * pendência P-015; esta tela traz os dados e pode ser impressa ou salva em PDF.
 */
export function ReceiptPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const receipt = useQuery({ queryKey: ['receipt', id], queryFn: () => api.time.receipt(id) });

  if (receipt.isPending) return <Skeleton className="mx-auto h-96 max-w-md" />;
  if (!receipt.data) return <Alert variant="destructive">{errorMessage(receipt.error)}</Alert>;
  const r = receipt.data;

  const rows: [string, string][] = [
    ['Empregador', r.company.legalName ?? r.company.name],
    ['CNPJ', r.company.cnpj ? formatCnpj(r.company.cnpj) : '—'],
    ['Local', r.unit.address ? `${r.unit.name} — ${r.unit.address}` : r.unit.name],
    ['Trabalhador', r.employee.name],
    ['CPF', formatCpf(r.employee.cpf)],
    ['Data', formatDate(r.localDate)],
    ['Hora', `${r.localTime} (${r.timezone})`],
    ['NSR', r.nsr],
  ];

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Comprovante de registro de ponto</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium break-words">{value}</dd>
              </div>
            ))}
            <dt className="text-muted-foreground">Código</dt>
            <dd className="font-mono text-xs break-all">{r.hash}</dd>
          </dl>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={() => window.print()} className="print:hidden">
        <PrinterIcon />
        Imprimir ou salvar em PDF
      </Button>
    </div>
  );
}
