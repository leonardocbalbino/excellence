import { formatCpf } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { formatDate } from '@/format';
import { accessQueryKey } from '@/query-keys';
import { errorMessage, useApi, useSession } from '@/services';
import { Banner, Button, Card, Label, Screen, styles, Title } from '@/ui';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={[styles.row, { paddingVertical: 4 }]}>
      <Label tone="muted">{label}</Label>
      <Label style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value ?? '—'}</Label>
    </View>
  );
}

/** Meu perfil (só leitura: o cadastro é mantido pelo RH). */
export default function ProfileScreen() {
  const api = useApi();
  const session = useSession();
  const access = useQuery({ queryKey: accessQueryKey, queryFn: () => api.access.mine() });
  const employee = useQuery({
    queryKey: ['me', 'employee'],
    queryFn: () => api.employees.mine(),
    enabled: access.data?.hasEmployeeRecord ?? false,
  });
  const data = employee.data;

  return (
    <Screen>
      <Button label="‹ Voltar" variant="ghost" onPress={() => router.back()} />
      <Title>Meu perfil</Title>
      {employee.isError ? <Banner tone="warning">{errorMessage(employee.error)}</Banner> : null}
      {data ? (
        <>
          <Card>
            <Label style={{ fontWeight: '700' }}>Dados pessoais</Label>
            <Field label="Nome" value={data.socialName ?? data.name} />
            <Field label="CPF" value={formatCpf(data.cpf)} />
            <Field label="Nascimento" value={data.birthDate ? formatDate(data.birthDate) : null} />
            <Field label="E-mail" value={data.email} />
            <Field label="Telefone" value={data.phone} />
          </Card>
          <Card>
            <Label style={{ fontWeight: '700' }}>Vínculo</Label>
            <Field label="Matrícula" value={data.registrationNumber} />
            <Field label="Admissão" value={formatDate(data.hireDate)} />
            <Field label="Posto de trabalho" value={data.unit.name} />
            <Field label="Cargo" value={data.position?.name} />
            <Field label="Gestor direto" value={data.manager?.name} />
          </Card>
          <Banner tone="info">Algum dado errado? Fale com o RH.</Banner>
        </>
      ) : null}
      {session.status === 'authenticated' ? (
        <Card>
          <Label style={{ fontWeight: '700' }}>Conta de acesso</Label>
          <Field label="Login" value={session.user.email} />
          <Field
            label="Verificação em 2 etapas"
            value={session.user.mfaEnabled ? 'Ativa' : 'Desativada'}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
