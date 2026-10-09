import { BENEFIT_KIND_LABELS } from '@excellence/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { formatBRL } from '@/format';
import { errorMessage, useApi } from '@/services';
import { Banner, Button, Card, Label, Screen, styles, Title } from '@/ui';

/** Benefícios vigentes e links úteis da empresa. */
export default function BenefitsScreen() {
  const api = useApi();
  const benefits = useQuery({ queryKey: ['me', 'benefits'], queryFn: () => api.benefits.mine() });
  const links = useQuery({
    queryKey: ['me', 'useful-links'],
    queryFn: () => api.usefulLinks.mine(),
  });

  return (
    <Screen>
      <Button label="‹ Voltar" variant="ghost" onPress={() => router.back()} />
      <Title>Benefícios e links</Title>
      {benefits.isError ? <Banner tone="warning">{errorMessage(benefits.error)}</Banner> : null}
      {benefits.data?.length === 0 ? (
        <Label tone="muted">Você ainda não tem benefícios cadastrados.</Label>
      ) : null}
      {benefits.data?.map((item) => (
        <Card key={item.id}>
          <Label style={{ fontWeight: '700', fontSize: 17 }}>{item.benefit.name}</Label>
          <Label tone="muted" style={{ fontSize: 13 }}>
            {BENEFIT_KIND_LABELS[item.benefit.kind]}
            {item.benefit.provider ? ` · ${item.benefit.provider}` : ''}
          </Label>
          {item.benefit.description ? <Label>{item.benefit.description}</Label> : null}
          <View style={styles.row}>
            <Label tone="muted">Pago pela empresa</Label>
            <Label style={{ fontWeight: '700' }}>{formatBRL(item.companyValue)}/mês</Label>
          </View>
          <View style={styles.row}>
            <Label tone="muted">Seu desconto</Label>
            <Label style={{ fontWeight: '700' }}>{formatBRL(item.employeeDiscount)}/mês</Label>
          </View>
          {item.benefit.howToUse ? <Label>Como usar: {item.benefit.howToUse}</Label> : null}
        </Card>
      ))}

      <Title style={{ fontSize: 18, marginTop: 8 }}>Links úteis</Title>
      {links.data?.length === 0 ? <Label tone="muted">Nenhum link cadastrado.</Label> : null}
      {links.data?.map((link) => (
        <Pressable
          key={link.id}
          accessibilityRole="link"
          accessibilityHint="Abre no navegador"
          onPress={() => void Linking.openURL(link.url)}
        >
          <Card>
            <Label style={{ fontWeight: '700' }}>{link.name} ↗</Label>
            {link.description ? <Label tone="muted">{link.description}</Label> : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
