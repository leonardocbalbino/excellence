import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Campo que o jurídico ainda precisa preencher. Fica destacado na página para que o rascunho
 * não passe por texto final; troque pelo valor e apague o destaque.
 */
function Fill({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-warning-soft px-1 font-semibold text-warning">[{children}]</mark>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Data desta versão da política (mostrada no topo). */
const UPDATED_AT = '29/10/2026';

/**
 * Política de privacidade do app Excellence, pública (sem login), para as lojas de apps
 * (Google Play e App Store exigem o endereço). Fonte única do texto: docs/loja aponta para cá.
 * Os campos em <Fill> dependem do jurídico/DPO (pendências P-005, P-006 e P-010).
 */
export function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <span className="flex items-center gap-3 font-display text-lg font-bold text-primary">
            <BrandMark />
            Excellence
          </span>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 leading-relaxed">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-balance">Política de privacidade</h1>
          <p className="text-muted-foreground">
            App Excellence · última atualização em {UPDATED_AT}
          </p>
        </div>

        <Section title="1. Quem somos">
          <p>
            O app <strong>Excellence</strong> é usado pelos funcionários das empresas que contratam
            o sistema Excellence. Cada <strong>empresa empregadora</strong> é a controladora dos
            dados dos seus funcionários. A <Fill>razão social do fornecedor</Fill>, CNPJ{' '}
            <Fill>CNPJ</Fill>, é a operadora: fornece o sistema e trata os dados em nome da empresa
            empregadora.
          </p>
          <p>
            Encarregado de dados (DPO): <Fill>nome</Fill>, <Fill>e-mail</Fill>.
          </p>
        </Section>

        <Section title="2. Quais dados o app trata">
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Cadastro:</strong> nome, e-mail, matrícula, CPF, posto de trabalho e cargo,
              informados pela empresa empregadora.
            </li>
            <li>
              <strong>Registro de ponto:</strong> data e hora de cada marcação, localização no
              momento do registro e, quando a empresa exige, uma foto (selfie). Marcações feitas sem
              internet levam o horário do aparelho e são identificadas como tal.
            </li>
            <li>
              <strong>Rondas:</strong> horário e localização da leitura do QR code de cada ponto.
            </li>
            <li>
              <strong>Fotos:</strong> foto de perfil e fotos anexadas aos chamados com o RH, quando
              você as envia.
            </li>
            <li>
              <strong>Mensagens:</strong> o conteúdo dos chamados abertos com o RH.
            </li>
            <li>
              <strong>Notificações:</strong> um identificador do aparelho (token de push), para
              enviar avisos.
            </li>
          </ul>
          <p>
            O app <strong>não</strong> grava áudio e <strong>não</strong> acessa contatos, arquivos
            ou outras fotos da galeria (só a que você escolher). Também <strong>não</strong> usa
            ferramentas de anúncio ou de análise. A digital e o reconhecimento facial são
            verificados pelo próprio celular e nunca chegam ao sistema.
          </p>
        </Section>

        <Section title="3. Para que os dados são usados">
          <ul className="list-disc space-y-2 pl-6">
            <li>
              Cumprir a obrigação legal de registro de jornada (Portaria MTP 671/2021) e a gestão do
              contrato de trabalho (LGPD, art. 7º, II e V).
            </li>
            <li>
              Conferir se o ponto e a ronda foram registrados no local de trabalho, quando a empresa
              adota essa regra.
            </li>
            <li>
              Calcular benefícios, como vale-alimentação e vale-transporte, pelos dias trabalhados.
            </li>
            <li>
              Atender os pedidos feitos ao RH e avisar sobre respostas, comunicados, rondas e
              turnos.
            </li>
          </ul>
        </Section>

        <Section title="4. Com quem os dados são compartilhados">
          <p>
            Os dados ficam no servidor do sistema e são acessados só pelas pessoas da empresa
            empregadora com permissão para isso (RH, gestores). Não vendemos nem compartilhamos
            dados com terceiros para outras finalidades.
          </p>
          <p>Usamos provedores de infraestrutura que tratam dados só para o serviço funcionar:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>hospedagem do servidor;</li>
            <li>
              serviço de notificações (Expo, Google Firebase Cloud Messaging e Apple Push
              Notification Service), que recebe só o token do aparelho e o texto do aviso.
            </li>
          </ul>
        </Section>

        <Section title="5. Por quanto tempo guardamos">
          <p>
            Pelo tempo do contrato de trabalho e, depois dele, pelos prazos exigidos pela legislação
            trabalhista e previdenciária: <Fill>prazos definidos pelo jurídico</Fill>. Depois, os
            dados são excluídos ou anonimizados.
          </p>
        </Section>

        <Section title="6. Segurança">
          <p>
            O acesso exige login e senha. O app guarda a sessão no armazenamento seguro do celular.
            Todas as ações relevantes ficam registradas em trilha de auditoria. Os registros de
            ponto não podem ser alterados, só ajustados por pedido aprovado e registrado.
          </p>
        </Section>

        <Section title="7. Seus direitos">
          <p>
            Você pode pedir confirmação, acesso, correção, anonimização, portabilidade e exclusão
            dos seus dados, nos limites da lei. Dados que a empresa precisa guardar por obrigação
            legal, como os registros de ponto, não podem ser excluídos antes do prazo legal.
          </p>
          <p>
            Para fazer um pedido, procure o RH da sua empresa ou escreva para{' '}
            <Fill>e-mail do encarregado</Fill>.
          </p>
        </Section>

        <Section title="8. Alterações">
          <p>
            Esta política pode mudar. A versão vigente fica sempre neste endereço, com a data da
            última atualização.
          </p>
        </Section>
      </main>
    </div>
  );
}
