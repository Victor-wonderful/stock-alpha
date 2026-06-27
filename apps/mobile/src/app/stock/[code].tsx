import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Snowflake5 } from '@/components/snowflake';
import { Card, Dot, IconButton } from '@/components/ui';
import { getStock, type StockDetail } from '@/data/stock';
import { getStockDetail } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';
import { color, radius } from '@/theme/tokens';

export default function StockDetailScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const load = useCallback(() => getStockDetail(code), [code]);
  const { data: s } = useQuery(load, getStock(code));

  return (
    <Screen
      gap={16}
      header={
        <NavHeader
          title={s.name}
          right={
            <>
              <IconButton icon="star-border" />
              <IconButton icon="share" />
            </>
          }
        />
      }>
      {/* 가격 히어로 */}
      <Card style={{ gap: 14 }} padding={20}>
        <View style={styles.spreadTop}>
          <View style={{ gap: 4 }}>
            <Text style={styles.meta}>{s.meta}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{s.price}</Text>
              <Text style={[styles.change, { color: s.changeUp ? color.good : color.bad }]}>{s.change}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={styles.verdictPill}>
              <Text style={{ color: color.textOnAccent, fontSize: 12, fontWeight: '700' }}>AI 판정 · {s.verdict}</Text>
            </View>
            <View style={styles.rowTiny}>
              <Text style={styles.muted11}>종합</Text>
              <Text style={{ color: color.textPrimary, fontSize: 14, fontWeight: '700' }}>{s.score}점</Text>
            </View>
          </View>
        </View>
        <Text style={styles.note}>{s.note}</Text>
      </Card>

      {/* 5축 */}
      <Snowflake5 data={s.snowflake} />

      {/* 밸류에이션 · 수급 */}
      <View style={styles.row12}>
        <KVPanel title="밸류에이션" rows={s.valuation} />
        <KVPanel title="수급 (10일)" rows={s.flow} />
      </View>

      {/* 매매 플랜 */}
      <Card accent style={{ gap: 14 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>매매 플랜</Text>
          <View style={styles.statusPill}>
            <Dot c={color.good} size={6} />
            <Text style={{ color: color.textOnAccent, fontSize: 12, fontWeight: '700' }}>지금 진입 타이밍</Text>
          </View>
        </View>
        <View style={styles.planBox}>
          <View style={styles.metrics}>
            <Metric label="진입" value={s.plan.entry} />
            <Metric label="목표" value={s.plan.target} pct={s.plan.targetPct} pctColor={color.good} />
            <Metric label="손절" value={s.plan.stop} pct={s.plan.stopPct} pctColor={color.bad} />
          </View>
          <View style={styles.subMetrics}>
            <SubMetric label="R:R" value={s.plan.rr} />
            <SubMetric label="비중" value={s.plan.weight} />
          </View>
        </View>
        <View style={styles.rowTiny}>
          <MaterialIcons name="notifications-active" size={14} color={color.accent} />
          <Text style={styles.footerTxt}>알림 켜짐 — 목표·손절 도달 시 알려드려요</Text>
        </View>
      </Card>

      {/* AI 리포트 요약 */}
      <Pressable onPress={() => router.push({ pathname: '/report/[id]', params: { id: String(s.reportId ?? s.code) } })}>
        <Card style={{ gap: 10 }}>
          <View style={styles.spread}>
            <View style={styles.rowTiny}>
              <MaterialIcons name="description" size={16} color={color.accent} />
              <Text style={styles.cardTitle}>AI 애널리스트 리포트</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={color.textTertiary} />
          </View>
          <Text style={styles.reportSummary}>{s.reportSummary}</Text>
        </Card>
      </Pressable>
    </Screen>
  );
}

function KVPanel({ title, rows }: { title: string; rows: StockDetail['valuation'] }) {
  return (
    <Card style={{ flex: 1, gap: 11 }} padding={16}>
      <Text style={styles.panelTitle}>{title}</Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.spread}>
          <Text style={styles.kvLabel}>{r.label}</Text>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: r.tone === 'good' ? color.good : r.tone === 'bad' ? color.bad : color.textPrimary,
            }}>
            {r.value}
          </Text>
        </View>
      ))}
    </Card>
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
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  row12: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spreadTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  cardTitle: { color: color.textPrimary, fontSize: 15, fontWeight: '700' },

  meta: { color: color.textTertiary, fontSize: 12, fontWeight: '500' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  price: { color: color.textPrimary, fontSize: 32, fontWeight: '700' },
  change: { fontSize: 13, fontWeight: '600', marginBottom: 5 },
  verdictPill: { backgroundColor: color.accent, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12 },
  note: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },

  panelTitle: { color: color.textPrimary, fontSize: 13, fontWeight: '700' },
  kvLabel: { color: color.textSecondary, fontSize: 11, fontWeight: '500' },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.accent,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  planBox: { gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: radius.inner, backgroundColor: color.surface2 },
  metrics: { flexDirection: 'row', gap: 10 },
  subMetrics: { flexDirection: 'row', gap: 18, borderTopWidth: 1, borderTopColor: color.border, paddingTop: 10 },
  footerTxt: { color: color.textSecondary, fontSize: 12, fontWeight: '600' },

  reportSummary: { color: color.textSecondary, fontSize: 12, fontWeight: '500', lineHeight: 18 },
});
