import type { MedicalCertificateInput } from '@excellence/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/lib/services';
import { employeesQueryKey } from '../workforce/query-keys';
import { CertificateForm } from './certificate-form';
import { certificatesQueryKey } from './labels';

/** RH registra um atestado entregue em papel, em nome do funcionário. */
export function EmployeeCertificatePage() {
  const { id = '' } = useParams();
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
    toast.success('Atestado registrado.');
    await navigate(`/pessoas/${id}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Registrar atestado</CardTitle>
          <CardDescription>{employee.data?.name ?? 'Carregando…'}</CardDescription>
        </CardHeader>
        <CardContent>
          <CertificateForm onSubmit={submit} onCancel={() => void navigate(`/pessoas/${id}`)} />
        </CardContent>
      </Card>
    </div>
  );
}
