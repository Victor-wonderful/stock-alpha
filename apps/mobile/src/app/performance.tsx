import { StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card, Pill } from '@/components/ui';
import { getPickTrack, SAMPLE_PICK_TRACK, type PerfState, type PickRec } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';
import { color, radius } from '@/theme/tokens';

const filters = ['전체', '진행중', '목표 달성', '손절'];
const STATE: Record<PerfState, { bg: string; fg: string }> = {
  진행중: { bg: color.warnSoft, fg: color.warn },
  '목표 달성': { bg: color.goodSoft, fg: color.good },
  '1차 익절': { bg: color.goodSoft, fg: color.good },
  손절: { bg: color.badSoft, fg: color.bad },
  만료: { bg: color.surface3, fg: color.textTertiary },
  '—': { bg: color.surface3, fg: color.textTertiary },
};
const RET_COLOR: Record<PickRec['retKind'], string> = {
  good: color.good,
  bad: color.bad,
  muted: color.textTertiary,
};

export default function PerformanceScreen() {
  const { data: track } = useQuery(getPickTrack, SAMPLE_PICK_TRACK);
  const records = track.records;
  const minis = [
    { l: '누적 발행', v: `${track.total}건`, c: color.textPrimary, align: 'flex-start' as const },
    { l: '목표 달성', v: `${track.target}건`, c: color.good, align: 'center' as const },
    { l: '손절', v: `${track.stopped}건`, c: color.bad, align: 'flex-end' as const },
  ];
  return (
    <Screen gap={16} header={<NavHeader title="성과" />}>
      {/* 히어로 */}
      <Card style={{ gap: 14 }} padding={20}>
        <View style={styles.spread}>
          <Text style={styles.heroLabel}>확정 픽 평균 수익률</Text>
          <Pill label="전체 발행 기준 · 삭제 없음" bg={color.surface3} fg={color.textTertiary} size={10} />
        </View>
        <View style={styles.rowEnd}>
          <Text style={[styles.heroVal, track.avgClosed.startsWith('-') && { color: color.bad }]}>
            {track.avgClosed}
          </Text>
          <Text style={styles.heroSub}>만료 {track.expired}건 포함</Text>
        </View>
        <View style={styles.miniRow}>
          {minis.map((m) => (
            <View key={m.l} style={[styles.miniCell, { alignItems: m.align }]}>
              <Text style={{ color: m.c, fontSize: 17, fontWeight: '700' }}>{m.v}</Text>
              <Text style={styles.muted11}>{m.l}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* 필터 */}
      <View style={styles.filterRow}>
        {filters.map((f, i) => (
          <View key={f} style={[styles.fChip, i === 0 ? { backgroundColor: color.accent, borderColor: color.accent } : { backgroundColor: color.surface2, borderColor: color.border }]}>
            <Text style={{ color: i === 0 ? color.textOnAccent : color.textSecondary, fontSize: 12, fontWeight: '600' }}>{f}</Text>
          </View>
        ))}
      </View>

      {/* 픽 기록 */}
      <View style={{ gap: 10 }}>
        {records.map((r) => {
          const st = STATE[r.state];
          return (
            <View key={r.name} style={styles.recCard}>
              <View style={styles.spread}>
                <View style={styles.rowTiny}>
                  <Text style={styles.recName}>{r.name}</Text>
                  <Text style={styles.muted11}>{r.code}</Text>
                </View>
                <View style={[styles.statePill, { backgroundColor: st.bg }]}>
                  <Text style={{ color: st.fg, fontSize: 10, fontWeight: '700' }}>{r.state}</Text>
                </View>
              </View>
              <View style={styles.meta}>
                <Text style={styles.muted11}>{r.date}</Text>
                <Text style={styles.muted11}>·</Text>
                <Text style={[styles.muted11, { color: color.textSecondary }]}>{r.setup}</Text>
              </View>
              <View style={styles.prices}>
                <Price label="진입" value={r.entry} />
                <Price label="목표" value={r.target} />
                <Price label="손절" value={r.stop} />
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={styles.muted10}>수익률</Text>
                  <Text style={{ color: RET_COLOR[r.retKind], fontSize: 15, fontWeight: '700' }}>{r.ret}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

function Price({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={styles.muted10}>{label}</Text>
      <Text style={{ color: color.textSecondary, fontSize: 12, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowEnd: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  muted10: { color: color.textTertiary, fontSize: 10, fontWeight: '500' },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },

  heroLabel: { color: color.textSecondary, fontSize: 13, fontWeight: '600' },
  heroVal: { color: color.good, fontSize: 38, fontWeight: '700', lineHeight: 42 },
  heroSub: { color: color.textTertiary, fontSize: 13, fontWeight: '500', marginBottom: 6 },
  miniRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: color.borderSoft, paddingTop: 14 },
  miniCell: { flex: 1, gap: 4 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fChip: { borderRadius: radius.pill, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 13 },

  recCard: { gap: 10, padding: 14, borderRadius: radius.inner, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  recName: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  statePill: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prices: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: 10,
  },
});
