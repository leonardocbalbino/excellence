import { BENEFIT_KIND_LABELS, type BenefitKind, type MyBenefit } from '@excellence/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, Text, View } from 'react-native';
import { estimateDays } from '@/benefit-estimate';
import { currentMonth, formatBRL, formatDate, todayIso } from '@/format';
import { timesheetKey } from '@/query-keys';
import { errorMessage, useApi } from '@/services';
import {
  Banner,
  Card,
  Chip,
  EmptyState,
  Hero,
  type IconName,
  Label,
  Screen,
  SectionTitle,
  Skeleton,
  styles,
  Title,
  Touchable,
  useColors,
} from '@/ui';

const KIND: Record<BenefitKind, { icon: IconName; colors: readonly [string, string] }> = {
  transport: { icon: 'bus', colors: ['#2563eb', '#3b82f6'] },
  food: { icon: 'cart', colors: ['#ea580c', '#f97316'] },
  meal: { icon: 'restaurant', colors: ['#d97706', '#f59e0b'] },
  health: { icon: 'medkit', colors: ['#dc2626', '#f43f5e'] },
  dental: { icon: 'happy', colors: ['#0891b2', '#06b6d4'] },
  life_insurance: { icon: 'shield-checkmark', colors: ['#7c3aed', '#8b5cf6'] },
  other: { icon: 'gift', colors: ['#0f5a52', '#16806f'] },
};

function yesterday(): string {
  const d = new Date(`${todayIso()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Benefícios vigentes e links úteis. VA e VT por dia mostram o valor diário e a prévia do
 * mês pelo próprio ponto; os de valor fixo, o valor mensal.
 */
export default function BenefitsScreen() {
  const api = useApi();
  const c = useColors();
  const month = currentMonth();
  const benefits = useQuery({ queryKey: ['me', 'benefits'], queryFn: () => api.benefits.mine() });
  const hasDaily = benefits.data?.some((b) => b.dailyValue !== null) ?? false;
  const sheet = useQuery({
    queryKey: [...timesheetKey, month],
    queryFn: () => api.time.myTimesheet(month),
    enabled: hasDaily,
  });
  const links = useQuery({
    queryKey: ['me', 'useful-links'],
    queryFn: () => api.usefulLinks.mine(),
  });

  const until = yesterday();
  const estimate = (item: MyBenefit) => {
    if (item.dailyValue === null || !sheet.data) return null;
    const days = estimateDays(sheet.data.days, item.benefit.calculation, item, until);
    return { days, total: Math.round(days * item.dailyValue * 100) / 100 };
  };
  const monthly =
    benefits.data?.reduce((sum, b) => sum + (b.dailyValue === null ? b.companyValue : 0), 0) ?? 0;
  const daily = benefits.data?.reduce((sum, b) => sum + (estimate(b)?.total ?? 0), 0) ?? 0;
  const discount = benefits.data?.reduce((sum, b) => sum + b.employeeDiscount, 0) ?? 0;

  return (
    <Screen
      title="Benefícios"
      subtitle="O que a empresa oferece a você"
      refreshing={benefits.isFetching || sheet.isFetching}
      onRefresh={() => {
        void benefits.refetch();
        void sheet.refetch();
        void links.refetch();
      }}
    >
      {benefits.isError ? <Banner tone="warning">{errorMessage(benefits.error)}</Banner> : null}

      {benefits.data && benefits.data.length > 0 ? (
        <Hero>
          <Label tone="inverse" style={{ opacity: 0.85 }}>
            A empresa investe em você neste mês
          </Label>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1 }}>
            {formatBRL(monthly + daily)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {hasDaily ? (
              <Chip tone="inverse" icon="analytics" label="VA/VT pelo seu ponto até ontem" />
            ) : null}
            {discount > 0 ? (
              <Chip
                tone="inverse"
                icon="remove-circle"
                label={`Seu desconto ${formatBRL(discount)}/mês`}
              />
            ) : null}
          </View>
        </Hero>
      ) : null}

      {benefits.isPending ? (
        <>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </>
      ) : benefits.data?.length === 0 ? (
        <Card>
          <EmptyState
            icon="gift-outline"
            title="Nenhum benefício ainda"
            text="Quando o RH cadastrar um benefício para você, ele aparece aqui."
          />
        </Card>
      ) : null}

      {benefits.data?.map((item, index) => {
        const kind = KIND[item.benefit.kind];
        const preview = estimate(item);
        return (
          <Card key={item.id} index={index} style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
            <LinearGradient
              colors={kind.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.row, { padding: 16, justifyContent: 'flex-start', gap: 12 }]}
            >
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: '#ffffff33',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={kind.icon} size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
                  {item.benefit.name}
                </Text>
                <Text style={{ color: '#ffffffd9', fontSize: 13 }}>
                  {BENEFIT_KIND_LABELS[item.benefit.kind]}
                  {item.benefit.provider ? ` · ${item.benefit.provider}` : ''}
                </Text>
              </View>
            </LinearGradient>
            <View style={{ padding: 16, gap: 10 }}>
              {item.dailyValue !== null ? (
                <>
                  <View style={styles.row}>
                    <Label tone="muted">Por dia trabalhado</Label>
                    <Label style={{ fontWeight: '800' }}>{formatBRL(item.dailyValue)}</Label>
                  </View>
                  {preview ? (
                    <View style={styles.row}>
                      <Label tone="muted">Neste mês, até ontem</Label>
                      <Label tone="primary" style={{ fontWeight: '800' }}>
                        {preview.days} {preview.days === 1 ? 'dia' : 'dias'} ={' '}
                        {formatBRL(preview.total)}
                      </Label>
                    </View>
                  ) : sheet.isPending ? (
                    <Skeleton height={16} />
                  ) : null}
                </>
              ) : (
                <View style={styles.row}>
                  <Label tone="muted">Pago pela empresa</Label>
                  <Label style={{ fontWeight: '800' }}>{formatBRL(item.companyValue)}/mês</Label>
                </View>
              )}
              {item.employeeDiscount > 0 ? (
                <View style={styles.row}>
                  <Label tone="muted">Seu desconto</Label>
                  <Label style={{ fontWeight: '700' }}>
                    {formatBRL(item.employeeDiscount)}/mês
                  </Label>
                </View>
              ) : null}
              {item.benefit.description ? <Label>{item.benefit.description}</Label> : null}
              {item.benefit.howToUse ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Ionicons name="bulb-outline" size={18} color={kind.colors[0]} />
                  <Label style={{ flex: 1 }}>{item.benefit.howToUse}</Label>
                </View>
              ) : null}
              <Label tone="muted" style={{ fontSize: 12.5 }}>
                Desde {formatDate(item.startDate)}
                {item.endDate ? ` até ${formatDate(item.endDate)}` : ''}
              </Label>
            </View>
          </Card>
        );
      })}
      {hasDaily ? (
        <Label tone="muted" style={{ fontSize: 12.5 }}>
          O VA e o VT do mês saem dos dias trabalhados no ponto. A prévia acima é uma estimativa; o
          valor final é o do fechamento do RH, que pode ajustar exceções.
        </Label>
      ) : null}

      <SectionTitle>Links úteis</SectionTitle>
      {links.data?.length === 0 ? <Label tone="muted">Nenhum link cadastrado.</Label> : null}
      {links.data?.map((link, index) => (
        <Touchable
          key={link.id}
          accessibilityRole="link"
          accessibilityHint="Abre no navegador"
          onPress={() => void Linking.openURL(link.url)}
        >
          <Card index={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="link" size={22} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Title style={{ fontSize: 16 }}>{link.name}</Title>
              {link.description ? (
                <Label tone="muted" style={{ fontSize: 13 }}>
                  {link.description}
                </Label>
              ) : null}
            </View>
            <Ionicons name="open-outline" size={18} color={c.mutedForeground} />
          </Card>
        </Touchable>
      ))}
    </Screen>
  );
}
