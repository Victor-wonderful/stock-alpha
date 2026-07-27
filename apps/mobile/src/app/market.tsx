import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card, Pill } from '@/components/ui';
import {
  getMarketBoard,
  getMarketMacro,
  getMarketRegime,
  SAMPLE_MARKET_BOARD,
  SAMPLE_MARKET_MACRO,
  SAMPLE_REGIME,
  type MacroIndicator,
  type RegimeView,
} from '@/lib/queries';
import { fmtDate } from '@/lib/format';
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
const MACRO_TONE_C: Record<MacroIndicator['tone'], string> = {
  good: color.good,
  bad: color.bad,
  neutral: color.textSecondary,
};

// 억원 → 부호 포함 문자열. 1조(=10,000억) 이상은 조 단위로 축약.
const fmtEok = (n: number) => {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}조`;
  return `${sign}${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(abs)}억`;
};

export default function MarketScreen() {
  const { data: regime } = useQuery(getMarketRegime, SAMPLE_REGIME);
  const { data: macro, isSample: macroSample } = useQuery(getMarketMacro, SAMPLE_MARKET_MACRO);
  const { data: board, isSample: boardSample } = useQuery(getMarketBoard, SAMPLE_MARKET_BOARD);
  const pill = PILL_TONE[regime.pillKind];

  // 섹터: 모멘텀(상대강도 z) 내림차순 상위/하위, 막대는 |모멘텀| 최대값 기준 정규화.
  const sectors = [...board.sectors].sort((a, b) => b.momentum - a.momentum);
  const topSectors = [...sectors.slice(0, 3), ...sectors.slice(-3)].filter(
    (s, i, arr) => arr.findIndex((x) => x.name === s.name) === i,
  );
  const maxAbsMom = Math.max(0.1, ...sectors.map((s) => Math.abs(s.momentum)));
  // 수급: 섹터 flow(외인+기관 5일 순매수, 억원) 기준 순유입/순유출 상위.
  const inflow = [...board.sectors].sort((a, b) => b.flow - a.flow).slice(0, 3);
  const outflow = [...board.sectors].sort((a, b) => a.flow - b.flow).slice(0, 3);

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
          <Text style={styles.muted11}>{macroSample ? '예시' : 'FRED · 1~2일 지연'}</Text>
        </View>
        <View style={{ gap: 8 }}>
          {[0, 2].map((start) => (
            <View key={start} style={styles.row8}>
              {macro.slice(start, start + 2).map((m) => (
                <View key={m.label} style={styles.macroCell}>
                  <Text style={styles.muted10}>{m.label}</Text>
                  <Text style={styles.macroValue}>{m.value}</Text>
                  <Text style={{ color: MACRO_TONE_C[m.tone], fontSize: 10, fontWeight: '600' }}>{m.delta}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </Card>

      {/* 수급 (외국인+기관 5거래일 순매수, 섹터 합산 억원) */}
      <Card style={{ gap: 12 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>수급 · 섹터 자금</Text>
          <Text style={styles.muted11}>
            {boardSample ? '예시' : `외인+기관 5일 · ${fmtDate(board.asOf)} 기준`}
          </Text>
        </View>
        <View style={styles.netBox}>
          <Text style={styles.muted11}>외국인+기관 순매수 (5거래일)</Text>
          <Text style={{ color: board.netFlow >= 0 ? color.good : color.bad, fontSize: 22, fontWeight: '800' }}>
            {fmtEok(board.netFlow)}
          </Text>
        </View>
        <View style={styles.row8}>
          <View style={styles.flowCol}>
            <Text style={[styles.muted10, { color: color.good }]}>순유입 상위</Text>
            {inflow.map((s) => (
              <View key={s.name} style={styles.spread}>
                <Text style={styles.kvLabel}>{s.name}</Text>
                <Text style={{ color: color.good, fontSize: 12, fontWeight: '700' }}>{fmtEok(s.flow)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.flowCol}>
            <Text style={[styles.muted10, { color: color.bad }]}>순유출 상위</Text>
            {outflow.map((s) => (
              <View key={s.name} style={styles.spread}>
                <Text style={styles.kvLabel}>{s.name}</Text>
                <Text style={{ color: color.bad, fontSize: 12, fontWeight: '700' }}>{fmtEok(s.flow)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {/* 섹터 로테이션 (상대강도 = 섹터 모멘텀 z) */}
      <Card style={{ gap: 12 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>섹터 로테이션</Text>
          <Text style={styles.muted11}>{boardSample ? '예시' : '상대강도'}</Text>
        </View>
        {topSectors.map((s) => {
          const c = s.momentum >= 0 ? color.good : color.bad;
          const w = Math.round((Math.abs(s.momentum) / maxAbsMom) * 100);
          return (
            <View key={s.name} style={styles.sectorRow}>
              <Text style={styles.sectorName}>{s.name}</Text>
              <View style={styles.track}>
                <View style={{ width: `${w}%`, height: 8, borderRadius: 999, backgroundColor: c }} />
              </View>
              <Text style={[styles.sectorPct, { color: c }]}>
                {s.momentum >= 0 ? '+' : '−'}
                {Math.abs(s.momentum).toFixed(1)}
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

  netBox: { gap: 4, padding: 12, paddingHorizontal: 14, borderRadius: radius.inner, backgroundColor: color.surface2 },
  flowCol: { flex: 1, gap: 6, padding: 12, borderRadius: radius.inner, backgroundColor: color.surface2 },

  track: { flex: 1, height: 8, borderRadius: 999, backgroundColor: color.surface3, overflow: 'hidden' },

  sectorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectorName: { width: 58, color: color.textSecondary, fontSize: 12, fontWeight: '600' },
  sectorPct: { width: 48, textAlign: 'right', fontSize: 12, fontWeight: '700' },
});
