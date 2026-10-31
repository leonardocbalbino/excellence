import {
  type Benefit,
  BENEFIT_CALCULATION_LABELS,
  BENEFIT_KIND_LABELS,
  benefitCalculationSchema,
  isDailyCalculation,
  type BenefitInput,
  benefitInputSchema,
  benefitKindSchema,
} from '@excellence/shared';
import { formatBRL } from '@/lib/format';
import { useApi } from '@/lib/services';
import { CatalogPage } from '../organization/catalog-page';
import { benefitsQueryKey } from './labels';

/** Catálogo de benefícios da empresa. A atribuição é feita no cadastro do funcionário. */
export function BenefitsCatalogPage() {
  const api = useApi();
  return (
    <CatalogPage<Benefit>
      config={{
        title: 'Benefícios',
        description:
          'Benefícios oferecidos pela empresa. Para dar um benefício a alguém, abra o cadastro do funcionário.',
        singular: 'benefício',
        managePermission: 'benefits:manage',
        queryKey: benefitsQueryKey,
        schema: benefitInputSchema,
        fields: [
          { name: 'name', label: 'Nome', kind: 'text' },
          {
            name: 'kind',
            label: 'Tipo',
            kind: 'select',
            options: benefitKindSchema.options.map((k) => ({
              value: k,
              label: BENEFIT_KIND_LABELS[k],
            })),
          },
          { name: 'provider', label: 'Fornecedor', kind: 'text', optional: true },
          {
            name: 'description',
            label: 'Descrição',
            kind: 'text',
            optional: true,
            hint: 'Regras e o que cobre. O funcionário vê este texto.',
          },
          {
            name: 'howToUse',
            label: 'Como usar',
            kind: 'text',
            optional: true,
            hint: 'Cartão, aplicativo, rede credenciada, contato…',
          },
          {
            name: 'calculation',
            label: 'Regra de cálculo',
            kind: 'select',
            options: benefitCalculationSchema.options.map((c) => ({
              value: c,
              label: BENEFIT_CALCULATION_LABELS[c],
            })),
            hint: 'Por dia: só VA e VT. O valor do mês sai do ponto (Remuneração › VA/VT).',
          },
          {
            name: 'defaultDailyValue',
            label: 'Valor diário sugerido (R$/dia)',
            kind: 'number',
            optional: true,
            hint: 'Só para cálculo por dia. Pode mudar por funcionário.',
          },
          {
            name: 'defaultCompanyValue',
            label: 'Valor sugerido pago pela empresa (R$/mês)',
            kind: 'number',
            optional: true,
            hint: 'Só para valor fixo por mês.',
          },
          {
            name: 'defaultEmployeeDiscount',
            label: 'Desconto sugerido do funcionário (R$/mês)',
            kind: 'number',
            optional: true,
          },
        ],
        columns: [
          { header: 'Tipo', cell: (b) => BENEFIT_KIND_LABELS[b.kind] },
          { header: 'Fornecedor', cell: (b) => b.provider ?? '—' },
          { header: 'Cálculo', cell: (b) => BENEFIT_CALCULATION_LABELS[b.calculation] },
          {
            header: 'Valor sugerido',
            cell: (b) =>
              isDailyCalculation(b.calculation)
                ? `${formatBRL(b.defaultDailyValue)}/dia`
                : formatBRL(b.defaultCompanyValue),
          },
        ],
        defaults: (b) => ({
          name: b?.name ?? '',
          kind: b?.kind ?? 'transport',
          provider: b?.provider ?? null,
          description: b?.description ?? null,
          howToUse: b?.howToUse ?? null,
          calculation: b?.calculation ?? 'monthly',
          defaultDailyValue: b?.defaultDailyValue ?? null,
          defaultCompanyValue: b?.defaultCompanyValue ?? null,
          defaultEmployeeDiscount: b?.defaultEmployeeDiscount ?? null,
          isActive: b?.isActive ?? true,
        }),
        list: (includeInactive) => api.benefits.list(includeInactive),
        create: (values) => api.benefits.create(values as BenefitInput),
        update: (id, values) => api.benefits.update(id, values as BenefitInput),
        remove: (id) => api.benefits.remove(id),
      }}
    />
  );
}
