import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card, Pill } from '@/components/ui';
import { getMarketRegime, SAMPLE_REGIME, type RegimeView } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';
import { color, radius } from '@/theme/tokens';

// 레짐 톤 → 색
const PILL_TONE: Record<RegimeView['pillKind'], { bg: string; fg: string }> = {
  bad: { bg: color.badSoft, fg: color.bad },
  good: { bg: color.goodSoft, fg: color.good },
  warn: { bg: color.warnSoft, fg: color.warn },
};
const DRIVER_TONE: Record<RegimeView['drivers'][number]['kind'], { icon: 'trending-up' | 'trending-down' | 'bar-chart'; c: string }> = {
  good: { icon: 'trending-up', c: color.good },
  bad: { icon: 'trending-down', c: color.bad },
  neutral: { icon: 'bar-chart', c: color.textSecondary },
};
const macro = [
  { l: '미국 10년물', v: '4.12%', d: '+3bp', c: color.bad },
  { l: '달러인덱스', v: '103.2', d: '−0.2', c: color.good },
  { l: 'WTI', v: '$71.4', d: '+1.1%', c: color.bad },
  { l: '한국 기준금리', v: '2.50%', d: '동결', c: color.textSecondary },
  { l: '미국 CPI', v: '2.6%', d: '둔화 지속', c: color.good },
  { l: '하이일드', v: '3.1%p', d: '+0.2p', c: color.warn },
];
const flows = [
  { l: '외국인 순매수', v: '+8,420억', c: color.good },
  { l: '기관 순매수', v: '+1,950억', c: color.good },
  { l: '개인 순매수', v: '−1조 380억', c: color.bad },
];
const sectors = [
  { n: '방산', p: 2.4 },
  { n: '조선', p: 1.6 },
  { n: '통신', p: 0.4 },
  { n: '반도체', p: -1.2 },
  { n: '바이오', p: -1.9 },
  { n: '2차전지', p: -2.8 },
];
const SMAX = 2.8;

export default function MarketScreen() {
  const { data: regime } = useQuery(getMarketRegime, SAMPLE_REGIME);
  const pill = PILL_TONE[regime.pillKind];
  return (
    <Screen gap={16} header={<NavHeader title="시장" />}>
      {/* 레짐 히어로 */}
      <Card accent style={{ gap: 14 }}>
        <View style={styles.spread}>
          <Pill label={regime.label} bg={pill.bg} fg={pill.fg} left={<MaterialIcons name="shield" size={14} color={pill.fg} />} />
          <Text style={{ color: color.textPrimary, fontSize: 12, fontWeight: '700' }}>
            레짐 점수 {regime.score > 0 ? '+' : ''}{regime.score}
          </Text>
        </View>
        <View style={styles.gauge}>
          <View style={styles.gaugeBar}>
            <View style={[styles.seg, { backgroundColor: color.bad, borderTopLeftRadius: 999, borderBottomLeftRadius: 999 }]} />
            <View style={[styles.seg, { backgroundColor: color.warn }]} />
            <View style={[styles.seg, { backgroundColor: color.good, borderTopRightRadius: 999, borderBottomRightRadius: 999 }]} />
          </View>
          <View style={[styles.marker, { left: `${regime.markerPct}%` }]} />
        </View>
        <View style={styles.spread}>
          {['약세장 · 방어', '중립', '강세장 · 공격'].map((t) => (
            <Text key={t} style={styles.legend}>{t}</Text>
          ))}
        </View>
        <Text style={styles.desc}>
          모멘텀·브레드스·외국인 수급 3축 합성. 지금은 신규 진입 비중 축소 · 추격 매수 금지 · 손절 엄수 구간입니다.
        </Text>
      </Card>

      {/* 레짐 드라이버 */}
      <View style={{ gap: 8 }}>
        <Text style={styles.smallLabel}>레짐 드라이버</Text>
        {regime.drivers.map((d) => {
          const t = DRIVER_TONE[d.kind];
          return (
            <View key={d.text} style={styles.driverRow}>
              <MaterialIcons name={t.icon} size={14} color={t.c} />
              <Text style={{ color: t.c, fontSize: 12, fontWeight: '600' }}>{d.text}</Text>
            </View>
          );
        })}
      </View>

      {/* 매크로 */}
      <Card style={{ gap: 12 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>매크로 지표</Text>
          <Text style={styles.muted11}>FRED · 일배치</Text>
        </View>
        <View style={{ gap: 8 }}>
          {[0, 2, 4].map((start) => (
            <View key={start} style={styles.row8}>
              {macro.slice(start, start + 2).map((m) => (
                <View key={m.l} style={styles.macroCell}>
                  <Text style={styles.muted10}>{m.l}</Text>
                  <Text style={styles.macroValue}>{m.v}</Text>
                  <Text style={{ color: m.c, fontSize: 10, fontWeight: '600' }}>{m.d}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </Card>

      {/* 수급 · 브레드스 */}
      <Card style={{ gap: 12 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>수급 · 브레드스</Text>
          <Text style={styles.muted11}>5일 누적</Text>
        </View>
        {flows.map((f) => (
          <View key={f.l} style={styles.spread}>
            <Text style={styles.kvLabel}>{f.l}</Text>
            <Text style={{ color: f.c, fontSize: 13, fontWeight: '700' }}>{f.v}</Text>
          </View>
        ))}
        <View style={styles.breadthBox}>
          <View style={styles.spread}>
            <Text style={styles.muted11}>상승종목 비중 (20일)</Text>
            <Text style={{ color: color.bad, fontSize: 15, fontWeight: '700' }}>14%</Text>
          </View>
          <View style={styles.track}>
            <View style={{ width: '14%', height: 8, borderRadius: 999, backgroundColor: color.bad }} />
          </View>
          <Text style={styles.muted10}>역사적 하위 8% — 극단적 약세 브레드스</Text>
        </View>
      </Card>

      {/* 섹터 로테이션 */}
      <Card style={{ gap: 12 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>섹터 로테이션</Text>
          <Text style={styles.muted11}>전체</Text>
        </View>
        {sectors.map((s) => {
          const c = s.p >= 0 ? color.good : color.bad;
          const w = Math.round((Math.abs(s.p) / SMAX) * 100);
          return (
            <View key={s.n} style={styles.sectorRow}>
              <Text style={styles.sectorName}>{s.n}</Text>
              <View style={styles.track}>
                <View style={{ width: `${w}%`, height: 8, borderRadius: 999, backgroundColor: c }} />
              </View>
              <Text style={[styles.sectorPct, { color: c }]}>
                {s.p >= 0 ? '+' : '−'}
                {Math.abs(s.p)}%
              </Text>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row8: { flexDirection: 'row', gap: 8 },
  muted10: { color: color.textTertiary, fontSize: 10, fontWeight: '500' },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  cardTitle: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  smallLabel: { color: color.textTertiary, fontSize: 12, fontWeight: '600' },
  kvLabel: { color: color.textSecondary, fontSize: 12, fontWeight: '500' },

  gauge: { height: 16, justifyContent: 'center' },
  gaugeBar: { flexDirection: 'row', height: 6, gap: 3 },
  seg: { flex: 1, height: 6 },
  marker: {
    position: 'absolute',
    top: 1,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: color.bad,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  legend: { color: color.textTertiary, fontSize: 10, fontWeight: '500' },
  desc: { color: color.textSecondary, fontSize: 12, fontWeight: '500', lineHeight: 19 },

  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.inner,
    backgroundColor: color.surface2,
  },

  macroCell: { flex: 1, gap: 4, paddingVertical: 11, paddingHorizontal: 13, borderRadius: radius.inner, backgroundColor: color.surface2 },
  macroValue: { color: color.textPrimary, fontSize: 17, fontWeight: '700' },

  breadthBox: { gap: 7, padding: 12, paddingHorizontal: 14, borderRadius: radius.inner, backgroundColor: color.surface2 },
  track: { flex: 1, height: 8, borderRadius: 999, backgroundColor: color.surface3, overflow: 'hidden' },

  sectorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectorName: { width: 58, color: color.textSecondary, fontSize: 12, fontWeight: '600' },
  sectorPct: { width: 48, textAlign: 'right', fontSize: 12, fontWeight: '700' },
});
