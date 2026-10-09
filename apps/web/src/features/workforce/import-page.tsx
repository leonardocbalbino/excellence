import {
  EMPLOYEE_IMPORT_MAX_ROWS,
  type EmployeeImportReport,
  FILE_PURPOSES,
} from '@excellence/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, CheckCircle2Icon, DownloadIcon, UploadIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
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
import { errorMessage, useApi } from '@/lib/services';
import { uploadFile } from '@/lib/upload';
import { employeesQueryKey } from './query-keys';

const ACCEPT = FILE_PURPOSES.spreadsheet_import.contentTypes.join(',') + ',.csv,.xlsx';

export function ImportPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [report, setReport] = useState<EmployeeImportReport | null>(null);

  const downloadTemplate = useMutation({
    mutationFn: () => api.employees.importTemplate(),
    onSuccess: (csv) => {
      // BOM para o Excel reconhecer UTF-8 (acentos).
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'modelo-importacao-funcionarios.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    },
  });

  const validate = useMutation({
    mutationFn: async (selected: File) => {
      const id = await uploadFile(api, selected, 'spreadsheet_import');
      setFileId(id);
      return api.employees.import({ fileId: id, dryRun: true });
    },
    onSuccess: setReport,
  });

  const confirm = useMutation({
    mutationFn: () => api.employees.import({ fileId: fileId ?? '', dryRun: false }),
    onSuccess: async (result) => {
      setReport(result);
      await queryClient.invalidateQueries({ queryKey: employeesQueryKey });
      if (result.imported > 0) toast.success(`${result.imported} funcionários importados.`);
    },
  });

  const reset = () => {
    setReport(null);
    setFileId(null);
    validate.reset();
    confirm.reset();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/pessoas">
          <ArrowLeftIcon />
          Funcionários
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Importar funcionários</h1>
        <p className="text-muted-foreground">
          A planilha é conferida inteira antes de gravar. Se houver qualquer erro, nada é importado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Prepare a planilha</CardTitle>
          <CardDescription>
            CSV (separado por ponto e vírgula ou vírgula) ou XLSX, até {EMPLOYEE_IMPORT_MAX_ROWS}{' '}
            linhas. Posto (coluna "unidade"), departamento, cargo e sindicato aceitam o código ou o
            nome cadastrado; o gestor é a matrícula. Datas em DD/MM/AAAA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => downloadTemplate.mutate()}
            disabled={downloadTemplate.isPending}
          >
            {downloadTemplate.isPending ? <Spinner /> : <DownloadIcon />}
            Baixar modelo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Envie e confira</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (file) {
                reset();
                validate.mutate(file);
              }
            }}
          >
            <div className="grid w-full gap-2 sm:w-96">
              <Label htmlFor="import-file">Planilha</Label>
              <Input
                id="import-file"
                type="file"
                accept={ACCEPT}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  reset();
                }}
              />
            </div>
            <Button type="submit" disabled={!file || validate.isPending}>
              {validate.isPending ? <Spinner /> : <UploadIcon />}
              Conferir planilha
            </Button>
          </form>
          {validate.isError ? (
            <Alert variant="destructive" className="mt-4">
              {errorMessage(validate.error)}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {report ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {report.imported > 0 ? (
              <Alert>
                <AlertTitle className="flex items-center gap-2">
                  <CheckCircle2Icon className="size-4 text-success" aria-hidden="true" />
                  {report.imported} funcionários importados.
                </AlertTitle>
                <Link to="/pessoas" className="text-primary hover:underline">
                  Ver funcionários
                </Link>
              </Alert>
            ) : report.errors.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <p>
                  Tudo certo: {report.validRows} de {report.totalRows} linhas prontas para importar.
                </p>
                <Button onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                  {confirm.isPending ? <Spinner /> : null}
                  Importar {report.validRows} funcionários
                </Button>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>
                  {report.errors.length} problema(s) em {report.totalRows - report.validRows}{' '}
                  linha(s). Corrija a planilha e envie de novo.
                </AlertTitle>
              </Alert>
            )}
            {confirm.isError ? (
              <Alert variant="destructive">{errorMessage(confirm.error)}</Alert>
            ) : null}
            {report.errors.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead>Coluna</TableHead>
                    <TableHead>Problema</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.errors.map((error, index) => (
                    <TableRow key={`${error.row}-${error.column ?? ''}-${index}`}>
                      <TableCell>{error.row}</TableCell>
                      <TableCell>{error.column ?? '—'}</TableCell>
                      <TableCell>{error.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
