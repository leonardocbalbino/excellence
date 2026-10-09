import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  useColorScheme,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Mesmas cores do web (apps/web/src/index.css). */
const LIGHT = {
  background: '#f4f2ed',
  foreground: '#16201d',
  card: '#ffffff',
  muted: '#ebe8e1',
  mutedForeground: '#5f6663',
  primary: '#0f5a52',
  primaryForeground: '#ffffff',
  primarySoft: '#e3eeeb',
  warning: '#b4451a',
  warningSoft: '#fbece4',
  destructive: '#b42318',
  border: '#e3dfd6',
};
const DARK: typeof LIGHT = {
  background: '#0f1614',
  foreground: '#eef2f0',
  card: '#17201d',
  muted: '#222d2a',
  mutedForeground: '#a3aeaa',
  primary: '#4fb3a5',
  primaryForeground: '#0b1513',
  primarySoft: '#183330',
  warning: '#f0936a',
  warningSoft: '#3a2219',
  destructive: '#f07167',
  border: '#2a3532',
};

export type Colors = typeof LIGHT;

/** Tema do aparelho (claro ou escuro). */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const c = useColors();
  const content = <View style={[padded && styles.padded, styles.gap]}>{children}</View>;
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={styles.grow}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const c = useColors();
  return <Text style={[styles.title, { color: c.foreground }, style]}>{children}</Text>;
}

export function Label({
  children,
  tone = 'default',
  style,
}: {
  children: ReactNode;
  tone?: 'default' | 'muted' | 'warning' | 'primary';
  style?: TextStyle;
}) {
  const c = useColors();
  const color =
    tone === 'muted'
      ? c.mutedForeground
      : tone === 'warning'
        ? c.warning
        : tone === 'primary'
          ? c.primary
          : c.foreground;
  return <Text style={[styles.label, { color }, style]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'inverse' | 'inverseGhost';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const c = useColors();
  const palette = {
    primary: { bg: c.primary, fg: c.primaryForeground, border: c.primary },
    outline: { bg: 'transparent', fg: c.primary, border: c.primary },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    inverse: { bg: '#ffffff', fg: '#0f5a52', border: '#ffffff' },
    // Sobre fundo verde (tela de bloqueio, cartão do ponto).
    inverseGhost: { bg: 'transparent', fg: '#ffffff', border: 'transparent' },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Banner({ children, tone }: { children: ReactNode; tone: 'warning' | 'info' }) {
  const c = useColors();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        { backgroundColor: tone === 'warning' ? c.warningSoft : c.primarySoft },
      ]}
    >
      <Text style={{ color: tone === 'warning' ? c.warning : c.primary, fontSize: 14 }}>
        {children}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  padded: { padding: 16 },
  gap: { gap: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 15 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  banner: { borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
