import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { BRAND, Touchable, usePulse } from './ui';

export type ClockButtonState = 'idle' | 'busy' | 'success' | 'error';

const SIZE = 188;

/**
 * Botão redondo do ponto: o halo pulsa chamando para o registro, vira um "check" verde quando
 * dá certo e treme quando dá errado.
 */
export function ClockButton({
  label,
  state,
  disabled,
  onPress,
}: {
  label: string;
  state: ClockButtonState;
  disabled?: boolean;
  onPress: () => void;
}) {
  const halo = usePulse(state === 'idle' && !disabled);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (state !== 'error') return;
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 60 }),
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withSpring(0),
    );
  }, [shake, state]);
  const shaking = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const background = state === 'success' ? '#16a34a' : state === 'error' ? '#c2410c' : BRAND.gold;
  const foreground = state === 'success' || state === 'error' ? '#ffffff' : BRAND.ink;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: SIZE + 40 }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            backgroundColor: BRAND.gold,
          },
          halo,
        ]}
      />
      <Animated.View style={shaking}>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: disabled || state === 'busy', busy: state === 'busy' }}
          disabled={disabled || state === 'busy'}
          scaleTo={0.93}
          onPress={onPress}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            backgroundColor: background,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: disabled ? 0.6 : 1,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
          }}
        >
          {state === 'busy' ? (
            <ActivityIndicator color={foreground} size="large" />
          ) : state === 'success' ? (
            <Animated.View entering={ZoomIn.springify().damping(10)}>
              <Ionicons name="checkmark-circle" size={76} color={foreground} />
            </Animated.View>
          ) : (
            <Ionicons
              name={state === 'error' ? 'alert-circle' : 'finger-print'}
              size={64}
              color={foreground}
            />
          )}
          <Text
            style={{
              color: foreground,
              fontWeight: '800',
              fontSize: 15,
              textAlign: 'center',
              paddingHorizontal: 18,
            }}
          >
            {state === 'success' ? 'Registrado!' : label}
          </Text>
        </Touchable>
      </Animated.View>
    </View>
  );
}
