import { zodResolver } from '@hookform/resolvers/zod';
import {
  type MfaActivateResponse,
  mfaCodeRequestSchema,
  type MfaSetupResponse,
} from '@excellence/shared';
import { useMutation } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage, useApi } from '@/lib/services';

type CodeForm = z.input<typeof mfaCodeRequestSchema>;

interface MfaEnrollmentProps {
  /** Token de cadastro obrigatório (login). Sem ele, usa a sessão atual. */
  enrollmentToken?: string | undefined;
  onDone: (result: MfaActivateResponse) => void;
}

/**
 * Cadastro do MFA em três passos: QR code para o aplicativo autenticador, confirmação com
 * um código e exibição única dos códigos de recuperação.
 */
export function MfaEnrollment({ enrollmentToken, onDone }: MfaEnrollmentProps) {
  const api = useApi();
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [result, setResult] = useState<MfaActivateResponse | null>(null);
  const [saved, setSaved] = useState(false);

  const start = useMutation({
    mutationFn: () => api.auth.setupMfa(enrollmentToken),
    onSuccess: async (data) => {
      setSetup(data);
      setQrCode(await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 220 }));
    },
  });

  // Cada chamada gera um segredo novo: garante uma só, mesmo com o StrictMode.
  const started = useRef(false);
  const { mutate: startSetup } = start;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startSetup();
  }, [startSetup]);

  const form = useForm<CodeForm>({
    resolver: zodResolver(mfaCodeRequestSchema),
    defaultValues: { code: '' },
  });
  const activate = useMutation({
    mutationFn: (values: CodeForm) => api.auth.activateMfa(values, enrollmentToken),
    onSuccess: setResult,
  });

  if (result) {
    return (
      <div className="grid gap-4">
        <Alert variant="warning">
          Guarde estes códigos de recuperação em local seguro. Cada um vale uma vez e serve para
          entrar se você perder o celular. Eles não serão mostrados de novo.
        </Alert>
        <ul
          aria-label="Códigos de recuperação"
          className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-4 font-mono text-sm"
        >
          {result.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Checkbox
            id="saved-codes"
            checked={saved}
            onCheckedChange={(checked) => setSaved(checked === true)}
          />
          <Label htmlFor="saved-codes">Guardei os códigos de recuperação</Label>
        </div>
        <Button disabled={!saved} onClick={() => onDone(result)}>
          Continuar
        </Button>
      </div>
    );
  }

  if (start.isError) {
    return (
      <div className="grid gap-3">
        <Alert variant="destructive">{errorMessage(start.error)}</Alert>
        <Button variant="outline" onClick={() => start.mutate()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!setup || !qrCode) return <Spinner label="Preparando o MFA" />;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => void form.handleSubmit((values) => activate.mutate(values))(event)}
      noValidate
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator…).</li>
        <li>Leia o QR code abaixo ou digite a chave manualmente.</li>
        <li>Informe o código de 6 dígitos que aparecer no aplicativo.</li>
      </ol>
      <img
        src={qrCode}
        alt="QR code para cadastrar no aplicativo autenticador"
        className="mx-auto size-[220px] rounded-md border bg-white"
      />
      <p className="text-center text-sm">
        Chave: <code className="font-mono break-all select-all">{setup.secret}</code>
      </p>
      <FormField label="Código do aplicativo" error={form.formState.errors.code?.message}>
        {(field) => (
          <Input
            {...field}
            {...form.register('code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
          />
        )}
      </FormField>
      {activate.isError ? (
        <Alert variant="destructive">{errorMessage(activate.error)}</Alert>
      ) : null}
      <Button type="submit" disabled={activate.isPending}>
        {activate.isPending ? <Spinner /> : null}
        Ativar MFA
      </Button>
    </form>
  );
}
