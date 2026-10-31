import { type UsefulLink, type UsefulLinkInput, usefulLinkInputSchema } from '@excellence/shared';
import { useApi } from '@/lib/services';
import { CatalogPage } from '../organization/catalog-page';
import { usefulLinksQueryKey } from './labels';

/** Links úteis mostrados a todos os funcionários na página de benefícios. */
export function UsefulLinksPage() {
  const api = useApi();
  return (
    <CatalogPage<UsefulLink>
      config={{
        title: 'Links úteis',
        description: 'Endereços que todos os funcionários veem em “Benefícios e links”.',
        singular: 'link',
        managePermission: 'useful_links:manage',
        queryKey: usefulLinksQueryKey,
        schema: usefulLinkInputSchema,
        fields: [
          { name: 'name', label: 'Título', kind: 'text' },
          { name: 'url', label: 'Endereço', kind: 'text', hint: 'Começando por https://' },
          { name: 'category', label: 'Grupo', kind: 'text', optional: true, hint: 'Ex.: Governo' },
          { name: 'description', label: 'Descrição', kind: 'text', optional: true },
          { name: 'position', label: 'Ordem', kind: 'number', hint: 'Menor aparece primeiro.' },
        ],
        columns: [
          {
            header: 'Endereço',
            cell: (l) => (
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {l.url}
              </a>
            ),
          },
          { header: 'Grupo', cell: (l) => l.category ?? '—' },
          { header: 'Ordem', cell: (l) => l.position },
        ],
        defaults: (l) => ({
          name: l?.name ?? '',
          url: l?.url ?? 'https://',
          category: l?.category ?? null,
          description: l?.description ?? null,
          position: l?.position ?? 0,
          isActive: l?.isActive ?? true,
        }),
        list: (includeInactive) => api.usefulLinks.list(includeInactive),
        create: (values) => api.usefulLinks.create(values as UsefulLinkInput),
        update: (id, values) => api.usefulLinks.update(id, values as UsefulLinkInput),
        remove: (id) => api.usefulLinks.remove(id),
      }}
    />
  );
}
