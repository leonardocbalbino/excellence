import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { currentMonth, formatMinutes, todayIso } from '@/format';
import { timesheetKey } from '@/query-keys';
import { errorMessage, useApi } from '@/services';
import {
  Banner,
  Card,
  Chip,
  Hero,
  Label,
  Screen,
  Skeleton,
  styles,
  Touchable,
  useColors,
} from '@/ui';

function shiftMonth(month: string, delta: number): string {
  const [year = 0, m = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayLabel(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''),
    day: date.slice(8, 10),
  };
}

/** Espelho de ponto do mês (ajustes são pedidos pelo site). */
export default function TimesheetScreen() {
  const api = useApi();
  const c = useColors();
  const [month, setMonth] = useState(currentMonth());
  const sheet = useQuery({
    queryKey: [...timesheetKey, month],
    queryFn: () => api.time.myTimesheet(month),
  });
  const label = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const days = sheet.data?.days.filter(
    (day) => day.entries.length > 0 || day.planned.shift || day.justifications.length > 0,
  );
  const balance = sheet.data
    ? sheet.data.totals.workedMinutes - sheet.data.totals.plannedMinutes
    : 0;
  const arrow = (delta: number, disabled = false) => (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={delta < 0 ? 'Mês anterior' : 'Próximo mês'}
      disabled={disabled}
      onPress={() => setMonth(shiftMonth(month, delta))}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#ffffff26',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={delta < 0 ? 'chevron-back' : 'chevron-forward'} size={22} color="#fff" />
    </Touchable>
  );

  return (
    <Screen
      title="Espelho de ponto"
      back
      refreshing={sheet.isFetching}
      onRefresh={() => void sheet.refetch()}
    >
      <Hero>
        <View style={styles.row}>
          {arrow(-1)}
          <Text
            style={{ color: '#fff', fontWeight: '800', fontSize: 18, textTransform: 'capitalize' }}
          >
            {label}
          </Text>
          {arrow(1, month >= currentMonth())}
        </View>
        <View style={[styles.row, { marginTop: 6 }]}>
          {[
            { title: 'Trabalhado', value: formatMinutes(sheet.data?.totals.workedMinutes ?? 0) },
            { title: 'Previsto', value: formatMinutes(sheet.data?.totals.plannedMinutes ?? 0) },
            { title: 'Saldo', value: `${balance > 0 ? '+' : ''}${formatMinutes(balance)}` },
          ].map((stat) => (
            <View key={stat.title} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 22 }}>{stat.value}</Text>
              <Text style={{ color: '#ffffffbb', fontSize: 12.5 }}>{stat.title}</Text>
            </View>
          ))}
        </View>
      </Hero>

      {sheet.isError ? <Banner tone="warning">{errorMessage(sheet.error)}</Banner> : null}
      {sheet.isPending ? (
        <>
          <Skeleton height={76} />
          <Skeleton height={76} />
          <Skeleton height={76} />
        </>
      ) : null}
      {days?.map((day, index) => {
        const { weekday, day: number } = dayLabel(day.date);
        const absent =
          day.date < todayIso() &&
          day.planned.shift &&
          !day.planned.holiday &&
          day.entries.length === 0 &&
          day.justifications.length === 0;
        return (
          <Card
            key={day.date}
            index={index}
            style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}
          >
            <View
              style={{
                width: 52,
                height: 56,
                borderRadius: 16,
                backgroundColor: absent ? c.warningSoft : c.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: absent ? c.warning : c.primary,
                  fontSize: 12,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                }}
              >
                {weekday}
              </Text>
              <Text
                style={{ color: absent ? c.warning : c.primary, fontSize: 20, fontWeight: '800' }}
              >
                {number}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Label style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {day.entries.length > 0
                  ? day.entries.map((e) => e.localTime).join('  ·  ')
                  : day.justifications.length > 0
                    ? 'Atestado'
                    : 'Sem marcações'}
              </Label>
              <Label tone="muted" style={{ fontSize: 13 }}>
                {day.planned.holiday
                  ? day.planned.holiday.name
                  : day.planned.shift
                    ? `Turno ${day.planned.shift.start}–${day.planned.shift.end}`
                    : 'Folga'}
                {day.workedMinutes > 0 ? ` · ${formatMinutes(day.workedMinutes)}` : ''}
              </Label>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {day.incomplete ? (
                  <Chip tone="warning" icon="alert" label="Falta uma marcação" />
                ) : null}
                {day.pendingAdjustments > 0 ? (
                  <Chip
                    tone="primary"
                    icon="hourglass"
                    label={`${String(day.pendingAdjustments)} ajuste(s) em análise`}
                  />
                ) : null}
                {day.justifications.length > 0 ? (
                  <Chip tone="success" icon="medkit" label="Atestado" />
                ) : null}
              </View>
            </View>
          </Card>
        );
      })}
      <Label tone="muted" style={{ fontSize: 13, textAlign: 'center' }}>
        Para pedir um ajuste, use o espelho de ponto no site.
      </Label>
    </Screen>
  );
}
