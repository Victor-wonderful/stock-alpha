import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, radius, space } from '@/theme/tokens';

type ScreenProps = {
  children: ReactNode;
  /** 섹션 간 세로 간격 */
  gap?: number;
  /** 좌우 페이지 패딩 적용 여부 */
  padded?: boolean;
  /** 스크롤 위에 고정되는 상단 네비게이션 헤더 */
  header?: ReactNode;
};

export function Screen({ children, gap = space.section, padded = true, header }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      {header ? <View style={{ paddingTop: insets.top }}>{header}</View> : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          {
            paddingTop: header ? 4 : insets.top + 8,
            paddingBottom: insets.bottom + 28,
            gap,
          },
          padded && { paddingHorizontal: space.page },
        ]}>
        {children}
      </ScrollView>
    </View>
  );
}

export function NavHeader({ title, right }: { title: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.nav}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={styles.circleBtn}>
        <MaterialIcons name="chevron-left" size={24} color={color.textPrimary} />
      </Pressable>
      <Text style={styles.navTitle}>{title}</Text>
      <View style={styles.navRight}>{right ?? <View style={{ width: 38, height: 38 }} />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: color.textPrimary,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
