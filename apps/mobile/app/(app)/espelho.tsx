import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { currentMonth, formatDate, formatMinutes } from '@/format';
import { timesheetKey } from '@/query-keys';
import { errorMessage, useApi } from '@/services';
import { Banner, Button, Card, Label, Screen, styles, Title } from '@/ui';

function shiftMonth(month: string, delta: number): string {
  const [year = 0, m = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Espelho de ponto do mês (ajustes são pedidos pelo site). */
export default function TimesheetScreen() {
  const api = useApi();
  const [month, setMonth] = useState(currentMonth());
  const sheet = useQuery({
    queryKey: [...timesheetKey, month],
    queryFn: () => api.time.myTimesheet(month),
  });
  const label = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Screen>
      <Button label="‹ Voltar" variant="ghost" onPress={() => router.back()} />
      <Title>Espelho de ponto</Title>
      <View style={styles.row}>
        <Button label="‹" variant="outline" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Label style={{ fontWeight: '700', textTransform: 'capitalize' }}>{label}</Label>
        <Button
          label="›"
          variant="outline"
          disabled={month >= currentMonth()}
          onPress={() => setMonth(shiftMonth(month, 1))}
        />
      </View>
      {sheet.isError ? <Banner tone="warning">{errorMessage(sheet.error)}</Banner> : null}
      {sheet.data ? (
        <Card>
          <View style={styles.row}>
            <Label tone="muted">Trabalhado</Label>
            <Label style={{ fontWeight: '700' }}>
              {formatMinutes(sheet.data.totals.workedMinutes)}
            </Label>
          </View>
          <View style={styles.row}>
            <Label tone="muted">Previsto</Label>
            <Label style={{ fontWeight: '700' }}>
              {formatMinutes(sheet.data.totals.plannedMinutes)}
            </Label>
          </View>
        </Card>
      ) : null}
      {sheet.data?.days
        .filter(
          (day) => day.entries.length > 0 || day.planned.shift || day.justifications.length > 0,
        )
        .map((day) => (
          <Card key={day.date}>
            <View style={styles.row}>
              <Label style={{ fontWeight: '700' }}>{formatDate(day.date)}</Label>
              <Label tone="muted">
                {day.planned.holiday
                  ? day.planned.holiday.name
                  : day.planned.shift
                    ? `${day.planned.shift.start}–${day.planned.shift.end}`
                    : 'Folga'}
              </Label>
            </View>
            <Label>
              {day.entries.length > 0
                ? day.entries.map((e) => e.localTime).join('  ·  ')
                : day.justifications.length > 0
                  ? 'Atestado'
                  : 'Sem marcações'}
            </Label>
            {day.incomplete ? <Label tone="warning">Falta uma marcação neste dia.</Label> : null}
            {day.pendingAdjustments > 0 ? (
              <Label tone="muted">{day.pendingAdjustments} ajuste(s) em análise</Label>
            ) : null}
          </Card>
        ))}
      <Label tone="muted" style={{ fontSize: 13 }}>
        Para pedir um ajuste, use o espelho de ponto no site.
      </Label>
    </Screen>
  );
}
