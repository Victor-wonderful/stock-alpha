import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card, Dot, IconButton, Pill } from '@/components/ui';
import { report as SAMPLE_REPORT } from '@/data/report';
import { getReportById } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';
import { color, radius } from '@/theme/tokens';

const ZMAX = 2.4;

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => getReportById(Number(id)), [id]);
  const { data: r } = useQuery(load, SAMPLE_REPORT);
  const allGatesPass = r.gates.every((g) => g.pass);
  return (
    <Screen
      gap={14}
      header={<NavHeader title="AI 리포트" right={<IconButton icon="share" />} />}>
      <Text style={styles.meta}>{r.meta}</Text>

      {/* 글랜스 */}
      <Card accent style={{ gap: 14 }} padding={20}>
        <View style={styles.spreadTop}>
          <View style={{ gap: 4 }}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.muted12}>{r.sub}</Text>
          </View>
          <View style={styles.rowEnd}>
            <Text style={styles.score}>{r.score}</Text>
            <Text style={styles.scoreUnit}>/ 100점</Text>
          </View>
        </View>
        <View style={styles.pills}>
          <Pill label={r.verdict} bg={color.accent} fg={color.textOnAccent} size={11} />
          <Pill
            label="오늘의 픽 1위"
            bg={color.accentSoft}
            fg={color.accent}
            size={11}
            left={<MaterialIcons name="star" size={11} color={color.accent} />}
          />
          <Pill
            label="지금 진입 타이밍"
            bg={color.accent}
            fg={color.textOnAccent}
            size={11}
            left={<Dot c={color.good} size={6} />}
          />
        </View>
        <Text style={styles.conclusion}>{r.conclusion}</Text>
        <View style={styles.riskBox}>
          <MaterialIcons name="warning" size={15} color={color.warn} />
          <Text style={styles.riskTxt}>{r.risk}</Text>
        </View>
      </Card>

      {/* 실행 플랜 */}
      <Card style={{ gap: 14 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>실행 플랜</Text>
          <Pill label="진입 유효" bg={color.goodSoft} fg={color.good} left={<Dot c={color.good} size={6} />} />
        </View>
        <View style={styles.planBox}>
          <View style={styles.metrics}>
            <Metric label="진입가" value={r.plan.entry} />
            <Metric label="목표가" value={r.plan.target} pct={r.plan.targetPct} pctColor={color.good} />
            <Metric label="손절가" value={r.plan.stop} pct={r.plan.stopPct} pctColor={color.bad} />
          </View>
          <View style={styles.subMetrics}>
            <SubMetric label="손익비 R:R" value={r.plan.rr} />
            <SubMetric label="권장 비중" value={r.plan.weight} />
          </View>
        </View>
        <Text style={styles.note}>{r.planNote}</Text>
      </Card>

      {/* 거래 가능 게이트 */}
      <Card style={{ gap: 12 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>거래 가능 게이트</Text>
          <Pill
            label={allGatesPass ? '전체 통과' : '일부 미달'}
            bg={allGatesPass ? color.goodSoft : color.warnSoft}
            fg={allGatesPass ? color.good : color.warn}
          />
        </View>
        {r.gates.map((g) => (
          <View key={g.name} style={styles.gateRow}>
            <MaterialIcons
              name={g.pass ? 'check-circle' : 'cancel'}
              size={16}
              color={g.pass ? color.good : color.bad}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.gateName}>{g.name}</Text>
              <Text style={styles.muted11}>{g.sub}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* 근거 */}
      <Card style={{ gap: 12 }}>
        <Text style={styles.cardTitleLg}>근거</Text>
        <View style={styles.traderBox}>
          <View style={styles.rowTiny}>
            <MaterialIcons name="show-chart" size={14} color={color.accent} />
            <Text style={styles.traderHead}>트레이더 관점</Text>
          </View>
          <Text style={styles.evidence}>{r.evidence}</Text>
        </View>
        {['퀀트 모델 관점', '밸류에이션 관점'].map((t) => (
          <View key={t} style={styles.collapseRow}>
            <Text style={styles.collapseTxt}>{t}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color={color.textTertiary} />
          </View>
        ))}
      </Card>

      {/* 팩터 z-score */}
      <Card style={{ gap: 12 }}>
        <Text style={styles.cardTitle}>팩터 z-score (섹터 중립)</Text>
        {r.factors.map((f) => {
          const c = f.z >= 0 ? color.good : color.bad;
          const w = Math.max(6, (Math.abs(f.z) / ZMAX) * 100);
          return (
            <View key={f.name} style={styles.factorRow}>
              <Text style={styles.factorLabel}>{f.name}</Text>
              <View style={styles.track}>
                <View style={{ width: `${w}%`, height: 7, borderRadius: 4, backgroundColor: c }} />
              </View>
              <Text style={[styles.factorValue, { color: c }]}>
                {f.z >= 0 ? '+' : '−'}
                {Math.abs(f.z)}σ
              </Text>
            </View>
          );
        })}
      </Card>

      {/* 수급 */}
      <Card style={{ gap: 11 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>수급 (10일)</Text>
          <Text style={styles.muted10}>네이버 금융 기준</Text>
        </View>
        {r.flow.map((f) => (
          <View key={f.label} style={styles.spread}>
            <Text style={styles.kvLabel}>{f.label}</Text>
            <Text style={{ color: f.tone === 'good' ? color.good : color.bad, fontSize: 13, fontWeight: '700' }}>
              {f.value}
            </Text>
          </View>
        ))}
      </Card>

      {/* 출처 · 면책 */}
      <View style={styles.sourceBox}>
        <MaterialIcons name="storage" size={13} color={color.textTertiary} />
        <Text style={styles.sourceTxt}>{r.source}</Text>
      </View>
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerTxt}>{r.disclaimer}</Text>
      </View>
    </Screen>
  );
}

function Metric({ label, value, pct, pctColor }: { label: string; value: string; pct?: string; pctColor?: string }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={styles.muted11}>{label}</Text>
      <Text style={{ color: color.textPrimary, fontSize: 16, fontWeight: '700' }}>{value}</Text>
      {pct ? <Text style={{ color: pctColor, fontSize: 11, fontWeight: '600' }}>{pct}</Text> : null}
    </View>
  );
}
function SubMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowTiny}>
      <Text style={styles.muted11}>{label}</Text>
      <Text style={{ color: color.accent, fontSize: 12, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowEnd: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spreadTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  muted10: { color: color.textTertiary, fontSize: 10, fontWeight: '500' },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  muted12: { color: color.textTertiary, fontSize: 12, fontWeight: '500' },
  cardTitle: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  cardTitleLg: { color: color.textPrimary, fontSize: 16, fontWeight: '700' },

  meta: { color: color.textTertiary, fontSize: 11, fontWeight: '500', lineHeight: 16 },

  name: { color: color.textPrimary, fontSize: 22, fontWeight: '700' },
  score: { color: color.accent, fontSize: 32, fontWeight: '700' },
  scoreUnit: { color: color.textTertiary, fontSize: 12, fontWeight: '500', marginBottom: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  conclusion: { color: color.textPrimary, fontSize: 14, fontWeight: '500', lineHeight: 22 },
  riskBox: {
    flexDirection: 'row',
    gap: 9,
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: radius.inner,
    backgroundColor: color.warnSoft,
    borderWidth: 1,
    borderColor: color.warnBorder,
  },
  riskTxt: { flex: 1, color: color.warn, fontSize: 12, fontWeight: '600', lineHeight: 18 },

  planBox: { gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: radius.inner, backgroundColor: color.surface2 },
  metrics: { flexDirection: 'row', gap: 10 },
  subMetrics: { flexDirection: 'row', gap: 18, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 10 },
  note: { color: color.textTertiary, fontSize: 11, fontWeight: '500', lineHeight: 16 },

  gateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gateName: { color: color.textPrimary, fontSize: 13, fontWeight: '600' },

  traderBox: { gap: 8, padding: 14, paddingHorizontal: 16, borderRadius: radius.inner, backgroundColor: color.surface2 },
  traderHead: { color: color.textPrimary, fontSize: 12, fontWeight: '700' },
  evidence: { color: color.textSecondary, fontSize: 12, fontWeight: '500', lineHeight: 19 },
  collapseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 13,
    paddingHorizontal: 16,
    borderRadius: radius.inner,
    backgroundColor: color.surface2,
  },
  collapseTxt: { color: color.textPrimary, fontSize: 13, fontWeight: '600' },

  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  factorLabel: { width: 48, color: color.textSecondary, fontSize: 12, fontWeight: '600' },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: color.surface3, overflow: 'hidden' },
  factorValue: { width: 44, textAlign: 'right', fontSize: 12, fontWeight: '700' },

  kvLabel: { color: color.textSecondary, fontSize: 12, fontWeight: '500' },

  sourceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: radius.inner,
    borderWidth: 1,
    borderColor: color.borderSoft,
  },
  sourceTxt: { flex: 1, color: color.textTertiary, fontSize: 10, fontWeight: '500', lineHeight: 14 },
  disclaimerBox: {
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: radius.inner,
    borderWidth: 1,
    borderColor: color.borderSoft,
  },
  disclaimerTxt: { color: color.textTertiary, fontSize: 11, fontWeight: '500', lineHeight: 17 },
});
