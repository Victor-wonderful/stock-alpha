import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Dot } from '@/components/ui';
import { Snowflake5, type Snowflake5Data } from '@/components/snowflake';
import { color, radius } from '@/theme/tokens';

export type PickBadge = { text: string; kind: 'neutral' | 'good' | 'accent' };

export type PickData = {
  name: string;
  code: string;
  hl?: boolean;
  status: { text: string; kind: 'now' | 'wait' };
  badges: PickBadge[];
  reason: string;
  entry: string;
  target: string;
  targetPct: string;
  stop: string;
  stopPct: string;
  rr: string;
  weight: string;
  score: number;
  snowflake: Snowflake5Data;
};

const BADGE: Record<PickBadge['kind'], { bg: string; fg: string }> = {
  neutral: { bg: color.surface3, fg: color.textSecondary },
  good: { bg: color.goodSoft, fg: color.good },
  accent: { bg: color.accentSoft, fg: color.accent },
};

export function PickCard({ pick, onReport }: { pick: PickData; onReport?: () => void }) {
  const now = pick.status.kind === 'now';
  return (
    <Card accent={pick.hl} style={{ gap: 14 }}>
      {/* head */}
      <View style={{ gap: 9 }}>
        <View style={styles.spread}>
          <View style={styles.rowEnd}>
            <Text style={styles.name}>{pick.name}</Text>
            <Text style={styles.code}>{pick.code}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: now ? color.accent : color.surface3 }]}>
            <Dot c={now ? color.good : color.warn} size={7} />
            <Text style={{ color: now ? color.textOnAccent : color.textPrimary, fontSize: 12, fontWeight: '700' }}>
              {pick.status.text}
            </Text>
          </View>
        </View>
        <View style={styles.badges}>
          {pick.badges.map((b, i) => (
            <View key={i} style={[styles.badge, { backgroundColor: BADGE[b.kind].bg }]}>
              <Text style={{ color: BADGE[b.kind].fg, fontSize: 10, fontWeight: '600' }}>{b.text}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.reason}>{pick.reason}</Text>

      {/* 매매 계획 */}
      <View style={styles.planBox}>
        <Text style={styles.planLabel}>매매 계획</Text>
        <View style={styles.metrics}>
          <Metric label="진입" value={pick.entry} />
          <Metric label="목표" value={pick.target} pct={pick.targetPct} pctColor={color.good} />
          <Metric label="손절" value={pick.stop} pct={pick.stopPct} pctColor={color.bad} />
        </View>
        <View style={styles.subMetrics}>
          <SubMetric label="R:R" value={pick.rr} />
          <SubMetric label="비중" value={pick.weight} />
        </View>
      </View>

      <Snowflake5 data={pick.snowflake} surface />

      <View style={styles.footer}>
        <MaterialIcons name="notifications-active" size={14} color={color.accent} />
        <Text style={styles.footerTxt}>알림 켜짐 — 목표·손절 도달 시 다시 알려드려요</Text>
      </View>

      <View style={styles.analysisRow}>
        <View style={styles.scoreChip}>
          <Text style={styles.muted11}>종합</Text>
          <Text style={{ color: color.textPrimary, fontSize: 12, fontWeight: '700' }}>{pick.score}점</Text>
        </View>
        <Pressable onPress={onReport} hitSlop={6} style={styles.reportLink}>
          <Text style={{ color: color.accent, fontSize: 12, fontWeight: '600' }}>종목 분석 보기</Text>
          <MaterialIcons name="chevron-right" size={15} color={color.accent} />
        </Pressable>
      </View>
    </Card>
  );
}

function Metric({ label, value, pct, pctColor }: { label: string; value: string; pct?: string; pctColor?: string }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },

  name: { color: color.textPrimary, fontSize: 18, fontWeight: '700' },
  code: { color: color.textTertiary, fontSize: 12, fontWeight: '500' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },

  reason: { color: color.textSecondary, fontSize: 13, fontWeight: '500', lineHeight: 19 },

  planBox: { gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: radius.inner, backgroundColor: color.surface2 },
  planLabel: { color: color.textTertiary, fontSize: 11, fontWeight: '600' },
  metrics: { flexDirection: 'row', gap: 10 },
  metricLabel: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  metricValue: { color: color.textPrimary, fontSize: 16, fontWeight: '700' },
  subMetrics: {
    flexDirection: 'row',
    gap: 18,
    borderTopWidth: 1,
    borderTopColor: color.border,
    paddingTop: 10,
  },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  footerTxt: { color: color.textSecondary, fontSize: 12, fontWeight: '600' },

  analysisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: 12,
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.surface3,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
