import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card, Pill } from '@/components/ui';
import { color, radius, verdictColors } from '@/theme/tokens';

const minis = [
  { l: '보유 종목', v: '5종목', align: 'flex-start' as const },
  { l: '투자원금', v: '26,610,000', align: 'center' as const },
  { l: '현금 비중', v: '12%', align: 'flex-end' as const },
];
type Hold = { name: string; code: string; init: string; val: string; pl: string; qty: string; verdict: '매수' | '중립' | '관망' };
const holds: Hold[] = [
  { name: 'SK하이닉스', code: '000660', init: 'SK', val: '2,214,000', pl: '+312,000 (+16.4%)', qty: '12주 · 평단 158,500', verdict: '매수' },
  { name: '삼성전자', code: '005930', init: '삼', val: '3,620,000', pl: '+180,000 (+5.2%)', qty: '50주 · 평단 68,800', verdict: '중립' },
  { name: '한미반도체', code: '042700', init: '한', val: '2,364,000', pl: '+148,000 (+6.7%)', qty: '20주 · 평단 110,800', verdict: '중립' },
  { name: '한성크린텍', code: '066980', init: '한', val: '1,134,000', pl: '+24,000 (+2.2%)', qty: '100주 · 평단 11,100', verdict: '매수' },
  { name: 'NAVER', code: '035420', init: 'N', val: '1,584,000', pl: '−62,000 (−3.8%)', qty: '8주 · 평단 205,700', verdict: '관망' },
];

export default function AssetsScreen() {
  return (
    <Screen gap={16} header={<NavHeader title="내 자산" />}>
      {/* 포트폴리오 히어로 */}
      <Card style={{ gap: 12 }} padding={20}>
        <View style={styles.spread}>
          <Text style={styles.heroLabel}>총 평가금액</Text>
          <Pill label="증권사 연동됨" bg={color.goodSoft} fg={color.good} size={10} left={<MaterialIcons name="link" size={12} color={color.good} />} />
        </View>
        <Text style={styles.total}>₩28,450,000</Text>
        <View style={styles.rowCenter}>
          <Text style={{ color: color.good, fontSize: 14, fontWeight: '700' }}>평가손익 +1,840,000</Text>
          <Pill label="+6.9%" bg={color.goodSoft} fg={color.good} size={11} />
          <Text style={styles.muted12}>· 오늘 +0.8%</Text>
        </View>
        <View style={styles.miniRow}>
          {minis.map((m) => (
            <View key={m.l} style={[styles.miniCell, { alignItems: m.align }]}>
              <Text style={styles.miniValue}>{m.v}</Text>
              <Text style={styles.muted11}>{m.l}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* 보유 종목 */}
      <View style={{ gap: 10 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>보유 종목</Text>
          <Text style={styles.muted12}>평가손익순</Text>
        </View>
        {holds.map((h) => {
          const v = verdictColors(h.verdict);
          const down = h.pl.startsWith('−');
          return (
            <View key={h.code} style={styles.holdCard}>
              <View style={styles.spread}>
                <View style={styles.rowCenter9}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{h.init}</Text>
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text style={styles.holdName}>{h.name}</Text>
                    <Text style={styles.muted11}>{h.code}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={styles.holdVal}>{h.val}</Text>
                  <Text style={{ color: down ? color.bad : color.good, fontSize: 11, fontWeight: '600' }}>{h.pl}</Text>
                </View>
              </View>
              <View style={styles.holdBot}>
                <Text style={styles.muted11}>{h.qty}</Text>
                <View style={styles.rowTiny}>
                  <Text style={styles.muted10}>Stock Alpha</Text>
                  <View style={[styles.vPill, { backgroundColor: v.bg }]}>
                    <Text style={{ color: v.fg, fontSize: 10, fontWeight: '700' }}>{h.verdict}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* 비수탁 안내 */}
      <View style={styles.custody}>
        <MaterialIcons name="lock" size={14} color={color.textTertiary} />
        <Text style={styles.custodyTxt}>비수탁 — 자금을 보유하지 않습니다. 출금 권한 없는 조회 전용 연동.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowCenter9: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted10: { color: color.textTertiary, fontSize: 10, fontWeight: '500' },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  muted12: { color: color.textTertiary, fontSize: 12, fontWeight: '500' },
  cardTitle: { color: color.textPrimary, fontSize: 15, fontWeight: '700' },

  heroLabel: { color: color.textSecondary, fontSize: 13, fontWeight: '600' },
  total: { color: color.textPrimary, fontSize: 32, fontWeight: '700' },
  miniRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: color.borderSoft, paddingTop: 14 },
  miniCell: { flex: 1, gap: 4 },
  miniValue: { color: color.textPrimary, fontSize: 15, fontWeight: '700' },

  holdCard: { gap: 9, padding: 14, borderRadius: radius.inner, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  avatar: { width: 30, height: 30, borderRadius: 999, backgroundColor: color.surface3, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: color.textSecondary, fontSize: 11, fontWeight: '700' },
  holdName: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  holdVal: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  holdBot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: 9,
  },
  vPill: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },

  custody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: radius.inner,
    backgroundColor: color.surface2,
  },
  custodyTxt: { flex: 1, color: color.textTertiary, fontSize: 11, fontWeight: '500', lineHeight: 16 },
});
