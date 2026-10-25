import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  useColorScheme,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Mesmas cores do web (apps/web/src/index.css), com o degradê do app. */
const LIGHT = {
  background: '#f4f2ed',
  foreground: '#16201d',
  card: '#ffffff',
  muted: '#ebe8e1',
  mutedForeground: '#5f6663',
  primary: '#0f5a52',
  primaryForeground: '#ffffff',
  primarySoft: '#e3eeeb',
  success: '#15803d',
  successSoft: '#e3f4e8',
  warning: '#b4451a',
  warningSoft: '#fbece4',
  destructive: '#b42318',
  border: '#e3dfd6',
  gradient: ['#0f5a52', '#16806f'] as readonly [string, string],
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
  success: '#4ade80',
  successSoft: '#163323',
  warning: '#f0936a',
  warningSoft: '#3a2219',
  destructive: '#f07167',
  border: '#2a3532',
  gradient: ['#0d4640', '#16705f'] as readonly [string, string],
};

export type Colors = typeof LIGHT;
export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Tema do aparelho (claro ou escuro). */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

// ─── Toque com mola e vibração ──────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Área tocável que encolhe de leve ao pressionar e vibra (toque curto). */
export function Touchable({
  children,
  style,
  haptic = true,
  scaleTo = 0.97,
  onPress,
  ...props
}: Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  haptic?: boolean;
  scaleTo?: number;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 400 });
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 14, stiffness: 300 });
        props.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

export const haptics = {
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};

// ─── Estrutura de tela ──────────────────────────────────────────────────────────────

export function Screen({
  children,
  title,
  subtitle,
  back = false,
  scroll = true,
  padded = true,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /** Mostra "Voltar" (telas abertas a partir de outra). */
  back?: boolean;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const c = useColors();
  const header =
    title || back ? (
      <Animated.View entering={FadeIn.duration(250)} style={{ gap: 2, marginBottom: 4 }}>
        {back ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={() => router.back()}
            style={[styles.row, { justifyContent: 'flex-start', paddingVertical: 6, gap: 2 }]}
          >
            <Ionicons name="chevron-back" size={20} color={c.primary} />
            <Text style={{ color: c.primary, fontSize: 16, fontWeight: '600' }}>Voltar</Text>
          </Touchable>
        ) : null}
        {title ? <Text style={[styles.screenTitle, { color: c.foreground }]}>{title}</Text> : null}
        {subtitle ? <Label tone="muted">{subtitle}</Label> : null}
      </Animated.View>
    ) : null;
  const content = (
    <View style={[padded && styles.padded, styles.gap, { paddingBottom: 110 }]}>
      {header}
      {children}
    </View>
  );
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.grow}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing ?? false}
                onRefresh={onRefresh}
                tintColor={c.primary}
                colors={[c.primary]}
              />
            ) : undefined
          }
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

/** Cartão que entra deslizando de baixo; `index` escalona a entrada numa lista. */
export function Card({
  children,
  style,
  index = 0,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  index?: number;
}) {
  const c = useColors();
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 60)
        .springify()
        .damping(18)}
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** Destaque com o degradê da marca (relógio do ponto, ronda em andamento, boas-vindas). */
export function Hero({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)}>
      <LinearGradient
        colors={c.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, style]}
      >
        {/* Círculos decorativos no canto. */}
        <View pointerEvents="none" style={[styles.heroBubble, { top: -60, right: -40 }]} />
        <View
          pointerEvents="none"
          style={[styles.heroBubble, { bottom: -80, left: -50, width: 180, height: 180 }]}
        />
        {children}
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Texto ───────────────────────────────────────────────────────────────────────────

export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const c = useColors();
  return <Text style={[styles.title, { color: c.foreground }, style]}>{children}</Text>;
}

export function Label({
  children,
  tone = 'default',
  style,
  numberOfLines,
}: {
  children: ReactNode;
  tone?: 'default' | 'muted' | 'warning' | 'primary' | 'success' | 'inverse';
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}) {
  const c = useColors();
  const color = {
    default: c.foreground,
    muted: c.mutedForeground,
    warning: c.warning,
    primary: c.primary,
    success: c.success,
    inverse: '#ffffff',
  }[tone];
  return (
    <Text numberOfLines={numberOfLines} style={[styles.label, { color }, style]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.row, { marginTop: 6 }]}>
      <Text style={{ color: c.foreground, fontSize: 18, fontWeight: '800' }}>{children}</Text>
      {action}
    </View>
  );
}

// ─── Controles ───────────────────────────────────────────────────────────────────────

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'inverse' | 'inverseGhost' | 'soft';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const c = useColors();
  const palette = {
    primary: { bg: c.primary, fg: c.primaryForeground, border: c.primary },
    outline: { bg: 'transparent', fg: c.primary, border: c.primary },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    soft: { bg: c.primarySoft, fg: c.primary, border: c.primarySoft },
    inverse: { bg: '#ffffff', fg: '#0f5a52', border: '#ffffff' },
    // Sobre o degradê (tela de bloqueio, cartão do ponto).
    inverseGhost: { bg: '#ffffff1f', fg: '#ffffff', border: 'transparent' },
  }[variant];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={[styles.row, { justifyContent: 'center', gap: 8 }]}>
          {icon ? <Ionicons name={icon} size={20} color={palette.fg} /> : null}
          <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
        </View>
      )}
    </Touchable>
  );
}

/** Campo com rótulo; a borda acende com a cor da marca ao focar. */
export function TextField({
  label,
  hint,
  multiline,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ fontWeight: '600', fontSize: 14 }}>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.mutedForeground}
        multiline={multiline}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.label,
          {
            borderWidth: focused ? 2 : 1,
            borderColor: focused ? c.primary : c.border,
            backgroundColor: c.card,
            color: c.foreground,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: multiline ? 12 : 0,
            minHeight: multiline ? 90 : 52,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {hint ? (
        <Label tone="muted" style={{ fontSize: 13 }}>
          {hint}
        </Label>
      ) : null}
    </View>
  );
}

export function Banner({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'warning' | 'info' | 'success';
}) {
  const c = useColors();
  const palette = {
    warning: { bg: c.warningSoft, fg: c.warning, icon: 'alert-circle' as const },
    info: { bg: c.primarySoft, fg: c.primary, icon: 'information-circle' as const },
    success: { bg: c.successSoft, fg: c.success, icon: 'checkmark-circle' as const },
  }[tone];
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      accessibilityRole="alert"
      style={[styles.banner, styles.row, { backgroundColor: palette.bg, alignItems: 'flex-start' }]}
    >
      <Ionicons name={palette.icon} size={20} color={palette.fg} />
      <Text style={{ color: palette.fg, fontSize: 14, flex: 1, lineHeight: 20 }}>{children}</Text>
    </Animated.View>
  );
}

export function Chip({
  label,
  tone = 'muted',
  icon,
}: {
  label: string;
  tone?: 'muted' | 'primary' | 'warning' | 'success' | 'inverse';
  icon?: IconName;
}) {
  const c = useColors();
  const palette = {
    muted: { bg: c.muted, fg: c.mutedForeground },
    primary: { bg: c.primarySoft, fg: c.primary },
    warning: { bg: c.warningSoft, fg: c.warning },
    success: { bg: c.successSoft, fg: c.success },
    inverse: { bg: '#ffffff26', fg: '#ffffff' },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
      {icon ? <Ionicons name={icon} size={13} color={palette.fg} /> : null}
      <Text style={{ color: palette.fg, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Ícone num círculo suave (listas e atalhos). */
export function IconCircle({
  name,
  size = 44,
  tone = 'primary',
}: {
  name: IconName;
  size?: number;
  tone?: 'primary' | 'warning' | 'success' | 'inverse';
}) {
  const c = useColors();
  const palette = {
    primary: { bg: c.primarySoft, fg: c.primary },
    warning: { bg: c.warningSoft, fg: c.warning },
    success: { bg: c.successSoft, fg: c.success },
    inverse: { bg: '#ffffff26', fg: '#ffffff' },
  }[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={size * 0.5} color={palette.fg} />
    </View>
  );
}

/** Barra de progresso que cresce com mola. */
export function ProgressBar({
  value,
  tone = 'primary',
}: {
  /** 0 a 1. */
  value: number;
  tone?: 'primary' | 'inverse';
}) {
  const c = useColors();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withSpring(Math.max(0, Math.min(1, value)), { damping: 20 });
  }, [progress, value]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{
        height: 10,
        borderRadius: 5,
        overflow: 'hidden',
        backgroundColor: tone === 'inverse' ? '#ffffff33' : c.muted,
      }}
    >
      <Animated.View
        style={[
          {
            height: '100%',
            borderRadius: 5,
            backgroundColor: tone === 'inverse' ? '#ffffff' : c.primary,
          },
          fill,
        ]}
      />
    </View>
  );
}

/** Bloco que pulsa enquanto o conteúdo carrega. */
export function Skeleton({ height = 18, style }: { height?: number; style?: ViewStyle }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.5, { duration: 700 })),
      -1,
    );
  }, [opacity, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ height, borderRadius: 10, backgroundColor: c.muted }, animated, style]}
    />
  );
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text?: string;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={{ alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 16 }}
    >
      <IconCircle name={icon} size={64} />
      <Label style={{ fontWeight: '700', fontSize: 17, textAlign: 'center' }}>{title}</Label>
      {text ? (
        <Label tone="muted" style={{ textAlign: 'center' }}>
          {text}
        </Label>
      ) : null}
    </Animated.View>
  );
}

/** Halo que pulsa em volta de um botão (chamada para a ação principal). */
export function usePulse(active: boolean) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced) {
      pulse.value = withTiming(0);
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [active, pulse, reduced]);
  return useAnimatedStyle(() => ({
    opacity: active ? 0.45 * (1 - pulse.value) : 0,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  padded: { padding: 18 },
  gap: { gap: 14 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 10 },
  hero: { borderRadius: 28, padding: 22, gap: 12, overflow: 'hidden' },
  heroBubble: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#ffffff14',
  },
  screenTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  label: { fontSize: 15, lineHeight: 21 },
  button: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  banner: { borderRadius: 14, padding: 12, gap: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
