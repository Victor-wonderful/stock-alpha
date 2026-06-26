import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Card } from '@/components/ui';
import { color, radius } from '@/theme/tokens';

type Icon = keyof typeof MaterialIcons.glyphMap;
type MenuItem = { icon: Icon; name: string; sub?: string; href?: Href; tint?: string };

const GROUPS: { label: string; items: MenuItem[] }[] = [
  {
    label: '탐색',
    items: [
      { icon: 'show-chart', name: '종목', sub: '검색·분석 허브', href: '/stocks', tint: color.accent },
      { icon: 'public', name: '시장', sub: '지수·섹터·레짐 분석', href: '/market' },
    ],
  },
  {
    label: '내 활동',
    items: [
      { icon: 'account-balance-wallet', name: '내 자산', sub: '보유 종목·평가손익', href: '/assets' },
      { icon: 'leaderboard', name: '성과', sub: '픽 트래커·검증 통과', href: '/performance' },
      { icon: 'bookmark', name: '워치리스트', sub: '관심 종목 모음', href: '/watchlist' },
    ],
  },
  {
    label: '기타',
    items: [
      { icon: 'settings', name: '설정' },
      { icon: 'help-outline', name: '고객센터' },
      { icon: 'logout', name: '로그아웃', tint: color.bad },
    ],
  },
];

export default function MoreScreen() {
  const router = useRouter();
  return (
    <Screen gap={24}>
      <Text style={styles.title}>더보기</Text>

      {/* 프로필 */}
      <Card style={styles.profile}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileInit}>S</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.profileName}>Stock Alpha 사용자</Text>
          <View style={styles.rowTiny}>
            <View style={styles.proBadge}>
              <Text style={{ color: color.accent, fontSize: 10, fontWeight: '700' }}>PRO</Text>
            </View>
            <Text style={styles.muted12}>cjstkdry@gmail.com</Text>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={color.textTertiary} />
      </Card>

      {GROUPS.map((g) => (
        <View key={g.label} style={{ gap: 10 }}>
          <Text style={styles.groupLabel}>{g.label}</Text>
          <Card padding={0} style={{ paddingHorizontal: 16 }}>
            {g.items.map((it, i) => (
              <Pressable
                key={it.name}
                onPress={() => it.href && router.push(it.href)}
                style={[styles.row, i > 0 && styles.topBorder]}>
                <View style={[styles.rowIcon, { backgroundColor: it.tint ? it.tint + '22' : color.surface3 }]}>
                  <MaterialIcons name={it.icon} size={20} color={it.tint ?? color.textSecondary} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.rowName}>{it.name}</Text>
                  {it.sub ? <Text style={styles.muted11}>{it.sub}</Text> : null}
                </View>
                <MaterialIcons name="chevron-right" size={20} color={color.textTertiary} />
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  muted12: { color: color.textTertiary, fontSize: 12, fontWeight: '500' },

  title: { color: color.textPrimary, fontSize: 26, fontWeight: '700' },

  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInit: { color: color.accent, fontSize: 22, fontWeight: '700' },
  profileName: { color: color.textPrimary, fontSize: 16, fontWeight: '700' },
  proBadge: { backgroundColor: color.accentSoft, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 8 },

  groupLabel: { color: color.textTertiary, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 },
  topBorder: { borderTopWidth: 1, borderTopColor: color.borderSoft },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowName: { color: color.textPrimary, fontSize: 15, fontWeight: '600' },
});
