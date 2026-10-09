import { BENEFIT_KIND_LABELS, type UsefulLink } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon, GiftIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/feedback';
import { formatBRL, formatDate } from '@/lib/format';
import { errorMessage, useApi } from '@/lib/services';
import { myBenefitsQueryKey, myUsefulLinksQueryKey } from './labels';

function groupLinks(links: UsefulLink[]): [string, UsefulLink[]][] {
  const groups = new Map<string, UsefulLink[]>();
  for (const link of links) {
    const key = link.category ?? 'Outros';
    groups.set(key, [...(groups.get(key) ?? []), link]);
  }
  return [...groups.entries()];
}

/** Benefícios vigentes do funcionário e os links úteis da empresa. */
export function MyBenefitsPage() {
  const api = useApi();
  const benefits = useQuery({ queryKey: myBenefitsQueryKey, queryFn: () => api.benefits.mine() });
  const links = useQuery({
    queryKey: myUsefulLinksQueryKey,
    queryFn: () => api.usefulLinks.mine(),
  });
  // `#links` (atalho do início) rola até os links quando eles carregam.
  const location = useLocation();
  useEffect(() => {
    if (location.hash === '#links' && links.data) {
      document.getElementById('links')?.scrollIntoView();
    }
  }, [location.hash, links.data]);
  const totalCompany = benefits.data?.reduce((sum, b) => sum + b.companyValue, 0) ?? 0;
  const totalDiscount = benefits.data?.reduce((sum, b) => sum + b.employeeDiscount, 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Benefícios e links</h1>
        <p className="text-muted-foreground">
          Seus benefícios vigentes e endereços úteis. Dúvidas sobre valores, fale com o RH.
        </p>
      </div>

      <section aria-labelledby="meus-beneficios" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="meus-beneficios" className="text-2xl font-bold">
            Meus benefícios
          </h2>
          {benefits.data && benefits.data.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              A empresa investe <strong>{formatBRL(totalCompany)}</strong>/mês · seu desconto{' '}
              <strong>{formatBRL(totalDiscount)}</strong>/mês
            </p>
          ) : null}
        </div>
        {benefits.isError ? (
          <Alert variant="destructive">{errorMessage(benefits.error)}</Alert>
        ) : benefits.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : benefits.data.length === 0 ? (
          <Alert>Você ainda não tem benefícios cadastrados.</Alert>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {benefits.data.map((item) => (
              <article key={item.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"
                      aria-hidden="true"
                    >
                      <GiftIcon className="size-5" />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold">{item.benefit.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {BENEFIT_KIND_LABELS[item.benefit.kind]}
                        {item.benefit.provider ? ` · ${item.benefit.provider}` : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant="soft">Vigente</Badge>
                </div>
                {item.benefit.description ? (
                  <p className="text-sm">{item.benefit.description}</p>
                ) : null}
                <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Pago pela empresa</dt>
                    <dd className="font-semibold">{formatBRL(item.companyValue)}/mês</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Seu desconto</dt>
                    <dd className="font-semibold">{formatBRL(item.employeeDiscount)}/mês</dd>
                  </div>
                </dl>
                {item.benefit.howToUse ? (
                  <p className="text-sm">
                    <span className="font-semibold">Como usar: </span>
                    {item.benefit.howToUse}
                  </p>
                ) : null}
                <p className="mt-auto text-xs text-muted-foreground">
                  Desde {formatDate(item.startDate)}
                  {item.endDate ? ` até ${formatDate(item.endDate)}` : ''}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="links" aria-labelledby="links-uteis" className="scroll-mt-24 space-y-4">
        <h2 id="links-uteis" className="text-2xl font-bold">
          Links úteis
        </h2>
        {links.isError ? (
          <Alert variant="destructive">{errorMessage(links.error)}</Alert>
        ) : links.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : links.data.length === 0 ? (
          <Alert>Nenhum link cadastrado.</Alert>
        ) : (
          groupLinks(links.data).map(([group, items]) => (
            <div key={group} className="space-y-2">
              <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {group}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {items.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-full items-start justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
                    >
                      <span>
                        <span className="block font-semibold">{link.name}</span>
                        {link.description ? (
                          <span className="block text-sm text-muted-foreground">
                            {link.description}
                          </span>
                        ) : null}
                        <span className="block truncate text-xs text-muted-foreground">
                          {new URL(link.url).hostname}
                        </span>
                      </span>
                      <ExternalLinkIcon
                        className="size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="sr-only">(abre em nova aba)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
