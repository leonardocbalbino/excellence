import Ionicons from '@expo/vector-icons/Ionicons';
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import Animated, { LinearTransition, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type IconName, Touchable, useColors } from './ui';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export interface TabItem {
  name: string;
  label: string;
  icon: IconName;
  activeIcon: IconName;
  /** Número no selo (ex.: comunicados não lidos). */
  badge?: number;
}

/**
 * Barra de abas flutuante: a aba ativa ganha uma pílula que desliza com mola e mostra o
 * nome; as outras ficam só com o ícone. Só aparecem as abas de `items` (as telas internas,
 * como o espelho, ficam fora).
 */
export function TabBar({ state, navigation, items }: TabBarProps & { items: readonly TabItem[] }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: Math.max(insets.bottom, 12),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: c.card,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: c.border,
          padding: 6,
          gap: 4,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        {items.map((item) => {
          const route = state.routes.find((r) => r.name === item.name);
          if (!route) return null;
          const focused = current === item.name;
          return (
            <Animated.View
              key={item.name}
              layout={LinearTransition.springify().damping(18)}
              style={{ flex: focused ? 2.2 : 1 }}
            >
              <Touchable
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: focused }}
                scaleTo={0.92}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
                style={{
                  height: 52,
                  borderRadius: 22,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: focused ? c.primary : 'transparent',
                }}
              >
                <View>
                  <Ionicons
                    name={focused ? item.activeIcon : item.icon}
                    size={22}
                    color={focused ? c.primaryForeground : c.mutedForeground}
                  />
                  {item.badge && item.badge > 0 && !focused ? (
                    <Animated.View
                      entering={ZoomIn}
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -8,
                        minWidth: 16,
                        height: 16,
                        borderRadius: 8,
                        paddingHorizontal: 3,
                        backgroundColor: c.warning,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                        {item.badge > 9 ? '9+' : item.badge}
                      </Text>
                    </Animated.View>
                  ) : null}
                </View>
                {focused ? (
                  <Animated.Text
                    entering={ZoomIn.springify().damping(16)}
                    numberOfLines={1}
                    style={{ color: c.primaryForeground, fontWeight: '700', fontSize: 14 }}
                  >
                    {item.label}
                  </Animated.Text>
                ) : null}
              </Touchable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}
