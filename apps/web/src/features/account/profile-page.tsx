import { type Employee, formatCpf } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon, LockIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { formatDate } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { useMyAccess } from '../access/access';
import { MFA_SETUP_PATH, PASSWORD_PATH } from '../auth/require-auth';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

/** 12345678901 → "123.45678.90-1" (NIS/PIS). */
function formatPis(value: string): string {
  const d = value.replace(/\D/g, '');
  return d.length === 11
    ? `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8, 10)}-${d.slice(10)}`
    : value;
}

/** 98999998888 → "(98) 99999-8888". */
function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{value ?? '—'}</dd>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border bg-card p-5 md:p-6">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      <dl className="mt-2 divide-y">{children}</dl>
    </section>
  );
}

/**
 * Meu perfil: os dados do próprio cadastro de funcionário e da conta de acesso. Só leitura:
 * correções passam pelo RH, que mantém o cadastro (e a auditoria das mudanças).
 */
export function ProfilePage() {
  const api = useApi();
  const access = useMyAccess();
  const hasEmployee = access.data?.hasEmployeeRecord ?? false;
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: () => api.auth.me() });
  const employee = useQuery({
    queryKey: ['me', 'employee'],
    queryFn: () => api.employees.mine(),
    enabled: hasEmployee,
  });

  if (me.isPending || access.isPending || (hasEmployee && employee.isPending)) {
    return <Skeleton className="mx-auto h-96 w-full max-w-3xl" />;
  }
  if (me.isError) return <Alert variant="destructive">{errorMessage(me.error)}</Alert>;
  const user = me.data;
  const data = employee.data;
  const displayName = data ? (data.socialName ?? data.name) : user.name;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <span
          className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-soft font-display text-xl font-bold text-primary"
          aria-hidden="true"
        >
          {initials(displayName)}
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Meu perfil</h1>
          <p className="text-muted-foreground">
            {displayName}
            {data?.position ? ` · ${data.position.name}` : ''}
            {data ? ` · ${data.unit.name}` : ''}
          </p>
        </div>
      </div>

      {employee.isError ? (
        <Alert variant="destructive">{errorMessage(employee.error)}</Alert>
      ) : null}

      {data ? (
        <>
          <PersonalData employee={data} />
          <Contract employee={data} />
          <Alert>
            Algum dado está errado ou desatualizado? Fale com o RH: o cadastro é mantido por ele e
            toda alteração fica registrada.
          </Alert>
        </>
      ) : (
        <Alert>
          Seu usuário não está ligado a um cadastro de funcionário, então aqui aparecem só os dados
          da conta de acesso.
        </Alert>
      )}

      <Section id="perfil-conta" title="Conta de acesso">
        <Field label="Nome na conta" value={user.name} />
        <Field label="E-mail de login" value={user.email} />
        <Field
          label="Verificação em duas etapas"
          value={
            user.mfaEnabled ? (
              <Badge variant="soft">
                <ShieldCheckIcon className="mr-1 size-3" aria-hidden="true" />
                Ativa
              </Badge>
            ) : (
              <Badge variant="outline">
                <ShieldOffIcon className="mr-1 size-3" aria-hidden="true" />
                Desativada
              </Badge>
            )
          }
        />
      </Section>
      <section
        aria-labelledby="perfil-preferencias"
        className="rounded-2xl border bg-card p-5 md:p-6"
      >
        <h2 id="perfil-preferencias" className="text-xl font-bold">
          Preferências
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Vale para este navegador. Também dá para trocar pelo menu da conta.
        </p>
        <ThemeToggle className="mt-4 max-w-sm" />
      </section>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to={PASSWORD_PATH}>
            <LockIcon />
            Trocar senha
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to={MFA_SETUP_PATH}>
            <KeyRoundIcon />
            Segurança da conta
          </Link>
        </Button>
      </div>
    </div>
  );
}

function PersonalData({ employee }: { employee: Employee }) {
  return (
    <Section id="perfil-pessoais" title="Dados pessoais">
      <Field label="Nome completo" value={employee.name} />
      {employee.socialName ? <Field label="Nome social" value={employee.socialName} /> : null}
      <Field label="CPF" value={formatCpf(employee.cpf)} />
      <Field label="PIS/NIS" value={employee.pis ? formatPis(employee.pis) : null} />
      <Field
        label="Data de nascimento"
        value={employee.birthDate ? formatDate(employee.birthDate) : null}
      />
      <Field label="E-mail" value={employee.email} />
      <Field label="Telefone" value={employee.phone ? formatPhone(employee.phone) : null} />
    </Section>
  );
}

function Contract({ employee }: { employee: Employee }) {
  return (
    <Section id="perfil-vinculo" title="Vínculo com a empresa">
      <Field label="Matrícula" value={employee.registrationNumber} />
      <Field
        label="Situação"
        value={
          employee.status === 'terminated' ? (
            <Badge variant="outline">Desligado</Badge>
          ) : (
            <Badge variant="soft">Ativo</Badge>
          )
        }
      />
      <Field label="Admissão" value={formatDate(employee.hireDate)} />
      {employee.terminationDate ? (
        <Field label="Último dia de trabalho" value={formatDate(employee.terminationDate)} />
      ) : null}
      <Field label="Posto de trabalho" value={employee.unit.name} />
      <Field label="Departamento" value={employee.department?.name} />
      <Field label="Cargo" value={employee.position?.name} />
      <Field label="Sindicato" value={employee.union?.name} />
      <Field label="Gestor direto" value={employee.manager?.name} />
    </Section>
  );
}
