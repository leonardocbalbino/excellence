import {
  ApiError,
  FILE_PURPOSES,
  type MedicalCertificateInput,
  medicalCertificateInputSchema,
} from '@excellence/shared';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/feedback';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayIso } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { uploadFile } from '@/lib/upload';

const ACCEPT = FILE_PURPOSES.medical_certificate.contentTypes.join(',');
// Só para validar os campos antes do envio do arquivo; o id real vem do upload.
const PLACEHOLDER_FILE_ID = '00000000-0000-4000-8000-000000000000';

type Fields = Omit<MedicalCertificateInput, 'fileId'>;

/**
 * Envio de atestado: valida os campos, envia o documento ao storage e registra. O CID é
 * opcional e só fica visível para quem tem a permissão sensível.
 */
export function CertificateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: MedicalCertificateInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const api = useApi();
  const [file, setFile] = useState<File | null>(null);
  const [partial, setPartial] = useState(false);
  const [values, setValues] = useState<Fields>({
    startDate: todayIso(),
    endDate: todayIso(),
    startTime: '',
    endTime: '',
    issuerName: '',
    issuerRegistry: '',
    cid: '',
    notes: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof Fields) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError(null);
    const fields: Fields = partial
      ? { ...values, endDate: values.startDate }
      : { ...values, startTime: null, endTime: null };
    const parsed = medicalCertificateInputSchema.safeParse({
      ...fields,
      fileId: PLACEHOLDER_FILE_ID,
    });
    const errors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        errors[path] ??= issue.message;
      }
    }
    if (!file) errors.file = 'Anexe o atestado (PDF ou foto).';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !file) return;

    setSaving(true);
    try {
      const fileId = await uploadFile(api, file, 'medical_certificate');
      await onSubmit({ ...fields, fileId });
    } catch (e) {
      if (e instanceof ApiError) setFieldErrors(e.fieldErrors);
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(e) => void submit(e)} noValidate>
      <FormField label="Documento (PDF ou foto)" error={fieldErrors.file ?? fieldErrors.fileId}>
        {(props) => (
          <Input
            {...props}
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
      </FormField>

      <div className="flex items-center gap-2">
        <Checkbox
          id="certificate-partial"
          checked={partial}
          onCheckedChange={(checked) => setPartial(checked === true)}
        />
        <Label htmlFor="certificate-partial">Afastamento por algumas horas (declaração)</Label>
      </div>

      {partial ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Dia" error={fieldErrors.startDate ?? fieldErrors.endDate}>
            {(props) => (
              <Input {...props} type="date" value={values.startDate} onChange={set('startDate')} />
            )}
          </FormField>
          <FormField label="Das" error={fieldErrors.startTime}>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={values.startTime ?? ''}
                onChange={set('startTime')}
              />
            )}
          </FormField>
          <FormField label="Até" error={fieldErrors.endTime}>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={values.endTime ?? ''}
                onChange={set('endTime')}
              />
            )}
          </FormField>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Primeiro dia" error={fieldErrors.startDate}>
            {(props) => (
              <Input {...props} type="date" value={values.startDate} onChange={set('startDate')} />
            )}
          </FormField>
          <FormField label="Último dia" error={fieldErrors.endDate}>
            {(props) => (
              <Input {...props} type="date" value={values.endDate} onChange={set('endDate')} />
            )}
          </FormField>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Profissional que emitiu (opcional)" error={fieldErrors.issuerName}>
          {(props) => (
            <Input {...props} value={values.issuerName ?? ''} onChange={set('issuerName')} />
          )}
        </FormField>
        <FormField
          label="Registro profissional (opcional)"
          hint="Ex.: CRM 123456/SP"
          error={fieldErrors.issuerRegistry}
        >
          {(props) => (
            <Input
              {...props}
              value={values.issuerRegistry ?? ''}
              onChange={set('issuerRegistry')}
            />
          )}
        </FormField>
      </div>
      <FormField
        label="CID (opcional)"
        hint="Você não é obrigado a informar. Só o RH autorizado vê, e todo acesso fica registrado."
        error={fieldErrors.cid}
      >
        {(props) => <Input {...props} value={values.cid ?? ''} onChange={set('cid')} />}
      </FormField>
      <FormField label="Observações (opcional)" error={fieldErrors.notes}>
        {(props) => <Input {...props} value={values.notes ?? ''} onChange={set('notes')} />}
      </FormField>

      {error ? <Alert variant="destructive">{errorMessage(error)}</Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner /> : null}
          Enviar atestado
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
