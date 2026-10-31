import type { MedicalCertificateInput } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/lib/services';
import { safeNext } from '../auth/safe-next';
import { employeesQueryKey } from '../workforce/query-keys';
import { CertificateForm } from './certificate-form';
import { certificatesQueryKey } from './labels';

/**
 * A administração anexa o atestado entregue pelo funcionário. Entra como válido, e o
 * funcionário passa a vê-lo em "Meus atestados".
 */
export function EmployeeCertificatePage() {
  const { id = '' } = useParams();
  // Volta para onde a pessoa estava (ex.: a pasta do posto), só com caminho interno.
  const [searchParams] = useSearchParams();
  const voltar = searchParams.get('voltar');
  const back = voltar ? safeNext(voltar) : `/pessoas/${id}`;
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const employee = useQuery({
    queryKey: [...employeesQueryKey, id],
    queryFn: () => api.employees.get(id),
  });

  const submit = async (input: MedicalCertificateInput) => {
    await api.medicalCertificates.registerFor(id, input);
    await queryClient.invalidateQueries({ queryKey: certificatesQueryKey });
    toast.success('Atestado anexado. O funcionário já pode visualizá-lo.');
    await navigate(back);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Anexar atestado</CardTitle>
          <CardDescription>{employee.data?.name ?? 'Carregando…'}</CardDescription>
        </CardHeader>
        <CardContent>
          <CertificateForm onSubmit={submit} onCancel={() => void navigate(back)} />
        </CardContent>
      </Card>
    </div>
  );
}
