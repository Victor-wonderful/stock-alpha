import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card, IconButton } from '@/components/ui';
import { color, radius, verdictColors } from '@/theme/tokens';

const changes = [
  { icon: 'star' as const, name: 'SK스퀘어', desc: '오늘의 픽 1위 선정 — 52주 신고가 셋업, 진입가 158,000원', c: color.accent },
  { icon: 'bolt' as const, name: '한미반도체', desc: '신규 시그널 — 눌림목 트리거 도달', c: color.good },
];
type Watch = { name: string; code: string; init: string; price: string; chg: string; verdict: '매수' | '중립' | '관망'; score: number; setup: string; alpha: string; bell: boolean };
const watch: Watch[] = [
  { name: 'SK스퀘어', code: '402340', init: 'SK', price: '157,400', chg: '+2.1%', verdict: '매수', score: 72, setup: '52주 신고가', alpha: '+1.4σ', bell: true },
  { name: 'SK하이닉스', code: '000660', init: 'SK', price: '184,500', chg: '+3.0%', verdict: '매수', score: 81, setup: '주도주 추세', alpha: '+1.9σ', bell: true },
  { name: '한미반도체', code: '042700', init: '한', price: '118,200', chg: '+1.3%', verdict: '중립', score: 61, setup: '눌림목', alpha: '+1.2σ', bell: true },
  { name: '삼성전자', code: '005930', init: '삼', price: '72,400', chg: '−0.4%', verdict: '중립', score: 58, setup: '관망', alpha: '+0.8σ', bell: false },
  { name: 'NAVER', code: '035420', init: 'N', price: '198,000', chg: '−0.8%', verdict: '관망', score: 49, setup: '관망', alpha: '+0.3σ', bell: false },
];

export default function WatchlistScreen() {
  const router = useRouter();
  return (
    <Screen gap={16} header={<NavHeader title="워치리스트" right={<IconButton icon="add" />} />}>
      {/* 오늘의 변화 */}
      <Card accent style={{ gap: 10 }} padding={16}>
        <Text style={styles.cardTitle}>오늘의 변화</Text>
        {changes.map((c) => (
          <View key={c.name} style={styles.changeRow}>
            <MaterialIcons name={c.icon} size={15} color={c.c} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.changeName}>{c.name}</Text>
              <Text style={styles.changeDesc}>{c.desc}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* 관심 종목 */}
      <View style={{ gap: 10 }}>
        {watch.map((w) => {
          const v = verdictColors(w.verdict);
          const down = w.chg.startsWith('−');
          return (
            <Pressable key={w.code} onPress={() => router.push({ pathname: '/stock/[code]', params: { code: w.code } })} style={styles.watchCard}>
              <View style={styles.spread}>
                <View style={styles.rowCenter9}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{w.init}</Text>
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text style={styles.watchName}>{w.name}</Text>
                    <Text style={styles.muted11}>{w.code}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={styles.price}>{w.price}</Text>
                  <Text style={{ color: down ? color.bad : color.good, fontSize: 11, fontWeight: '600' }}>{w.chg}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <View style={[styles.vPill, { backgroundColor: v.bg }]}>
                  <Text style={{ color: v.fg, fontSize: 10, fontWeight: '700' }}>{w.verdict} {w.score}</Text>
                </View>
                <Text style={styles.muted11}>{w.setup}</Text>
                <Text style={styles.muted11}>·</Text>
                <Text style={[styles.muted11, { color: color.textSecondary, fontWeight: '600' }]}>{w.alpha}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <MaterialIcons name={w.bell ? 'notifications-active' : 'notifications-off'} size={16} color={w.bell ? color.accent : color.textTertiary} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowCenter9: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  cardTitle: { color: color.textPrimary, fontSize: 13, fontWeight: '700' },

  changeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 10, paddingHorizontal: 12, borderRadius: radius.inner, backgroundColor: color.surface2 },
  changeName: { color: color.textPrimary, fontSize: 12, fontWeight: '700' },
  changeDesc: { color: color.textSecondary, fontSize: 11, fontWeight: '500', lineHeight: 16 },

  watchCard: { gap: 10, padding: 14, borderRadius: radius.inner, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  avatar: { width: 30, height: 30, borderRadius: 999, backgroundColor: color.surface3, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: color.textSecondary, fontSize: 11, fontWeight: '700' },
  watchName: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  price: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: 10,
  },
  vPill: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
});
