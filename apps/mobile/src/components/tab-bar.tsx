import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius } from '@/theme/tokens';

type IconName = keyof typeof MaterialIcons.glyphMap;

/** expo-router 가 tabBar 로 넘기는 props 중 사용하는 필드만 최소 타입 정의 */
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
};

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: '홈', icon: 'home' },
  recommend: { label: '추천', icon: 'recommend' },
  screener: { label: '스크리너', icon: 'tune' },
  alerts: { label: '알림', icon: 'notifications' },
  more: { label: '더보기', icon: 'menu' },
};

const ORDER = ['index', 'recommend', 'screener', 'alerts', 'more'];

export function CustomTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.capsule}>
        {ORDER.map((name) => {
          const route = state.routes.find((r) => r.name === name);
          const cfg = TABS[name];
          if (!route || !cfg) return null;
          const focused = state.routes[state.index]?.name === name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              hitSlop={8}
              style={[styles.tab, focused && styles.tabActive]}>
              <MaterialIcons
                name={cfg.icon}
                size={22}
                color={focused ? color.accent : color.textTertiary}
              />
              <Text
                style={[
                  styles.label,
                  { color: focused ? color.accent : color.textTertiary, fontWeight: focused ? '700' : '500' },
                ]}>
                {cfg.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: color.tabGlass,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    padding: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  tabActive: {
    backgroundColor: color.accentSoft,
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 10,
  },
});
