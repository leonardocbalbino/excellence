import type { PatrolPoint } from '@excellence/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, PrinterIcon, RefreshCwIcon } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { errorMessage, useApi } from '@/lib/services';
import { patrolPointsQueryKey } from './labels';

/**
 * QR codes dos pontos para impressão. O código em texto vai junto, para digitar se a câmera
 * falhar. Gerar um novo QR invalida o impresso antes.
 */
export function PatrolCodesPage() {
  const api = useApi();
  const [params] = useSearchParams();
  const only = params.get('ponto');
  const [unitId, setUnitId] = useState('all');
  const points = useQuery({
    queryKey: [...patrolPointsQueryKey, { includeInactive: false }],
    queryFn: () => api.patrolPoints.list(false),
  });
  const all = points.data ?? [];
  const units = [...new Map(all.map((p) => [p.unit.id, p.unit])).values()];
  const shown = all.filter(
    (p) => (only ? p.id === only : true) && (unitId === 'all' || p.unit.id === unitId),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <Link
            to="/gestao/rondas/pontos"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
            Pontos de ronda
          </Link>
          <h1 className="text-3xl font-bold">QR codes dos pontos</h1>
          <p className="text-muted-foreground">
            Imprima e afixe cada QR no local indicado. Se um QR for danificado ou copiado, gere um
            novo: o anterior deixa de valer na hora.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {only ? null : (
            <div className="grid gap-1.5">
              <Label htmlFor="codes-unit">Posto de trabalho</Label>
              <Select
                id="codes-unit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-48"
              >
                <option value="all">Todas</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button onClick={() => window.print()} disabled={shown.length === 0}>
            <PrinterIcon />
            Imprimir
          </Button>
        </div>
      </div>

      {points.isError ? <Alert variant="destructive">{errorMessage(points.error)}</Alert> : null}
      {points.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : shown.length === 0 ? (
        <Alert>Nenhum ponto ativo.</Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2">
          {shown.map((point) => (
            <CodeCard key={point.id} point={point} />
          ))}
        </div>
      )}
    </div>
  );
}

function CodeCard({ point }: { point: PatrolPoint }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(point.code, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(
      (url) => {
        if (!cancelled) setImage(url);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [point.code]);
  const regenerate = useMutation({
    mutationFn: () => api.patrolPoints.regenerateCode(point.id),
    onSuccess: async () => {
      toast.success(`Novo QR gerado para ${point.name}. Imprima e troque o antigo.`);
      await queryClient.invalidateQueries({ queryKey: patrolPointsQueryKey });
    },
  });

  return (
    <article className="flex break-inside-avoid flex-col items-center gap-3 rounded-2xl border bg-card p-5 text-center print:rounded-none print:border-2 print:border-black">
      <p className="text-sm text-muted-foreground print:text-black">{point.unit.name}</p>
      <h2 className="text-2xl font-bold">{point.name}</h2>
      {image ? (
        <img src={image} alt={`QR code do ponto ${point.name}`} className="size-56" />
      ) : (
        <Skeleton className="size-56" />
      )}
      <p className="text-xs text-muted-foreground print:text-black">
        Ponto de ronda · leia com o app
      </p>
      <code className="max-w-full break-all rounded bg-muted px-2 py-1 font-mono text-[0.625rem]">
        {point.code}
      </code>
      <p className="text-xs text-muted-foreground print:hidden">QR versão {point.codeVersion}</p>
      {regenerate.isError ? (
        <Alert variant="destructive" className="print:hidden">
          {errorMessage(regenerate.error)}
        </Alert>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="print:hidden"
        disabled={regenerate.isPending}
        onClick={() => {
          if (
            window.confirm(`Gerar novo QR para "${point.name}"? O impresso atual deixa de valer.`)
          ) {
            regenerate.mutate();
          }
        }}
      >
        <RefreshCwIcon />
        Gerar novo QR
      </Button>
    </article>
  );
}
