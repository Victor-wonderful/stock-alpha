import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card } from '@/components/ui';
import { color, radius, verdictColors } from '@/theme/tokens';

const filters = ['전체', '매수', '중립', '관망'];

type Row = { name: string; code: string; pick?: boolean; verdict: '매수' | '중립' | '관망'; score: number; line: string };
const groups: { date: string; rows: Row[] }[] = [
  {
    date: '6/25',
    rows: [
      { name: 'SK스퀘어', code: '402340', pick: true, verdict: '매수', score: 72, line: '신고가 경신 + 외국인·기관 동반 순매수 — 플랜 내 진입 유효' },
      { name: 'SK하이닉스', code: '000660', verdict: '매수', score: 81, line: 'HBM 수주 모멘텀 지속 · 주도주 추세 강화' },
      { name: '티에스이', code: '131290', verdict: '중립', score: 64, line: '수급 매집 초기 — 거래량 확인 후 대응' },
      { name: '한미반도체', code: '042700', verdict: '중립', score: 61, line: '눌림목 구간 · 밸류 부담 일부' },
    ],
  },
  {
    date: '6/24',
    rows: [
      { name: '삼성전자', code: '005930', verdict: '중립', score: 58, line: '업황 회복 신호, 밸류 부담 — 분할 접근' },
      { name: '신세계', code: '004170', verdict: '관망', score: 52, line: '수급 약세 지속 — 추세 전환 확인 필요' },
    ],
  },
];

export default function StocksHubScreen() {
  const router = useRouter();
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
        {filters.map((f, i) => (
          <View key={f} style={[styles.fChip, i === 0 ? { backgroundColor: color.accent, borderColor: color.accent } : { backgroundColor: color.surface2, borderColor: color.border }]}>
            <Text style={{ color: i === 0 ? color.textOnAccent : color.textSecondary, fontSize: 12, fontWeight: '600' }}>{f}</Text>
          </View>
        ))}
      </View>

      {/* 날짜별 분석 */}
      {groups.map((g) => (
        <View key={g.date} style={{ gap: 8 }}>
          <Text style={styles.groupLabel}>{g.date} 분석</Text>
          {g.rows.map((r) => {
            const v = verdictColors(r.verdict);
            return (
              <Pressable key={r.code} onPress={() => router.push({ pathname: '/stock/[code]', params: { code: r.code } })} style={styles.row}>
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={styles.rowTiny}>
                    <Text style={styles.name}>{r.name}</Text>
                    <Text style={styles.muted11}>{r.code}</Text>
                    {r.pick ? (
                      <View style={styles.pickBadge}>
                        <MaterialIcons name="star" size={10} color={color.accent} />
                        <Text style={{ color: color.accent, fontSize: 9, fontWeight: '700' }}>오늘의 픽</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.line}>{r.line}</Text>
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
      ))}
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
