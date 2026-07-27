import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card } from '@/components/ui';
import { getStockAnalyses, SAMPLE_STOCK_GROUPS, type StockVerdict } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';
import { color, radius, verdictColors } from '@/theme/tokens';

const filters = ['전체', '매수', '중립', '관망'] as const;
type Filter = (typeof filters)[number];

export default function StocksHubScreen() {
  const router = useRouter();
  const { data: groups } = useQuery(getStockAnalyses, SAMPLE_STOCK_GROUPS);
  const [active, setActive] = useState<Filter>('전체');

  // 판정 필터 적용 후 빈 그룹 제거.
  const shown = useMemo(() => {
    if (active === '전체') return groups;
    return groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => r.verdict === (active as StockVerdict)) }))
      .filter((g) => g.rows.length > 0);
  }, [groups, active]);

  return (
    <Screen gap={16} header={<NavHeader title="종목" />}>
      {/* 검색 */}
      <Card style={{ gap: 8 }} padding={16}>
        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={20} color={color.textSecondary} />
          <Text style={styles.placeholder}>종목명·코드로 검색 — 예: 삼성전자, 005930</Text>
        </View>
        <Text style={styles.hint}>선택 → 종목 상세 (5축 · 알파존 · AI 리포트)</Text>
      </Card>

      {/* 필터 */}
      <View style={styles.filterRow}>
        {filters.map((f) => {
          const on = f === active;
          return (
            <Pressable
              key={f}
              onPress={() => setActive(f)}
              style={[styles.fChip, on ? { backgroundColor: color.accent, borderColor: color.accent } : { backgroundColor: color.surface2, borderColor: color.border }]}
            >
              <Text style={{ color: on ? color.textOnAccent : color.textSecondary, fontSize: 12, fontWeight: '600' }}>{f}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* 날짜별 분석 */}
      {shown.length === 0 ? (
        <Text style={styles.empty}>해당 판정의 분석이 없습니다</Text>
      ) : (
        shown.map((g) => (
          <View key={g.date} style={{ gap: 8 }}>
            <Text style={styles.groupLabel}>{g.date} 분석</Text>
            {g.rows.map((r) => {
              const v = verdictColors(r.verdict);
              return (
                <Pressable key={`${g.date}-${r.code}`} onPress={() => router.push({ pathname: '/stock/[code]', params: { code: r.code } })} style={styles.row}>
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={styles.rowTiny}>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.muted11}>{r.code}</Text>
                      {r.pick ? (
                        <View style={styles.pickBadge}>
                          <MaterialIcons name="star" size={10} color={color.accent} />
                          <Text style={{ color: color.accent, fontSize: 9, fontWeight: '700' }}>추천 종목</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.line} numberOfLines={2}>{r.line}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <View style={[styles.vPill, { backgroundColor: v.bg }]}>
                      <Text style={{ color: v.fg, fontSize: 10, fontWeight: '700' }}>{r.verdict}</Text>
                    </View>
                    <Text style={styles.score}>{r.score}점</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  placeholder: { flex: 1, color: color.textTertiary, fontSize: 14, fontWeight: '500' },
  hint: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fChip: { borderRadius: radius.pill, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 14 },

  groupLabel: { color: color.textTertiary, fontSize: 12, fontWeight: '600' },
  empty: { color: color.textTertiary, fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.inner,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  name: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  pickBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: color.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  line: { color: color.textTertiary, fontSize: 11, fontWeight: '500', lineHeight: 16 },
  vPill: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  score: { color: color.textPrimary, fontSize: 13, fontWeight: '700' },
});
