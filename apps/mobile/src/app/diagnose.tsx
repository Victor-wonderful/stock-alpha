import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { NavHeader, Screen } from '@/components/screen';
import { Card, Pill } from '@/components/ui';
import { color, radius, verdictColors } from '@/theme/tokens';

const holdings = [
  ['삼성전자', '30%'],
  ['SK하이닉스', '25%'],
  ['SK스퀘어', '18%'],
  ['신세계', '12%'],
  ['현금', '15%'],
];
const checks = [
  { name: '알파', sub: '상위 12% · 양호', good: true },
  { name: '분산', sub: '섹터 쏠림 · 주의', good: false },
  { name: '리스크', sub: '변동성 높음', good: false },
  { name: '검증', sub: '백테스트 통과', good: true },
];
const stats = [
  { l: '가중 합성알파', v: '+1.12σ', s: '상위 12% · 양호', c: color.good },
  { l: '가중 베타', v: '1.18', s: '시장보다 변동 큼', c: color.warn },
  { l: '예상 변동성(연)', v: '28.4%', s: '코스피 19.2% 대비 높음', c: color.warn },
  { l: '섹터 집중도', v: '55%', s: '반도체·IT 쏠림', c: color.bad },
];
const ACTION: Record<string, { bg: string; fg: string }> = {
  유지: { bg: color.surface3, fg: color.textSecondary },
  추가: { bg: color.goodSoft, fg: color.good },
  축소: { bg: color.badSoft, fg: color.bad },
  재원: { bg: color.accentSoft, fg: color.accent },
};
type Diag = { name: string; code?: string; weight: string; verdict: '매수' | '중립' | '관망' | '—'; detail: string; action: keyof typeof ACTION; actionLabel: string };
const diags: Diag[] = [
  { name: 'SK하이닉스', code: '000660', weight: '25%', verdict: '매수', detail: '+3.0% · 업사이드 +14%', action: '유지', actionLabel: '유지' },
  { name: 'SK스퀘어', code: '402340', weight: '18%', verdict: '매수', detail: '+2.1% · 오늘의 픽', action: '추가', actionLabel: '비중 확대' },
  { name: '삼성전자', code: '005930', weight: '30%', verdict: '중립', detail: '−1.2% · 업사이드 +9.4%', action: '유지', actionLabel: '유지' },
  { name: '신세계', code: '004170', weight: '12%', verdict: '관망', detail: '−0.8% · 추세 약세', action: '축소', actionLabel: '비중 축소' },
  { name: '현금', weight: '15%', verdict: '—', detail: '분산 보강 재원', action: '재원', actionLabel: '분산 투입' },
];

export default function DiagnoseScreen() {
  return (
    <Screen gap={16} header={<NavHeader title="종목진단" />}>
      {/* 입력 */}
      <Card style={{ gap: 12 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>보유 종목 · 비중</Text>
          <Text style={styles.muted11}>입력 → 진단</Text>
        </View>
        <View style={styles.chips}>
          {holdings.map(([n, w]) => (
            <View key={n} style={styles.chip}>
              <Text style={{ color: color.textPrimary, fontSize: 12, fontWeight: '600' }}>{n}</Text>
              <Text style={{ color: color.accent, fontSize: 12, fontWeight: '700' }}>{w}</Text>
            </View>
          ))}
          <View style={[styles.chip, { borderColor: color.borderSoft }]}>
            <MaterialIcons name="add" size={14} color={color.textSecondary} />
            <Text style={{ color: color.textSecondary, fontSize: 12, fontWeight: '600' }}>추가</Text>
          </View>
        </View>
      </Card>

      {/* 종합 등급 */}
      <Card accent style={{ gap: 14 }}>
        <View style={{ gap: 3 }}>
          <Text style={styles.cardTitle}>종합 등급</Text>
          <Text style={styles.muted11}>4개 축 평가 — 알파 · 분산 · 리스크 · 검증</Text>
        </View>
        <View style={styles.gradeBody}>
          <View style={styles.gradeBadge}>
            <Text style={styles.gradeTxt}>B+</Text>
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            {checks.map((c) => (
              <View key={c.name} style={styles.checkRow}>
                <MaterialIcons name={c.good ? 'check-circle' : 'error'} size={15} color={c.good ? color.good : color.warn} />
                <Text style={styles.checkName}>{c.name}</Text>
                <Text style={styles.muted11}>{c.sub}</Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {/* 진단 지표 2x2 */}
      <View style={{ gap: 10 }}>
        {[0, 2].map((start) => (
          <View key={start} style={styles.row10}>
            {stats.slice(start, start + 2).map((s) => (
              <View key={s.l} style={styles.statCell}>
                <Text style={styles.muted11}>{s.l}</Text>
                <Text style={{ color: s.c, fontSize: 20, fontWeight: '700' }}>{s.v}</Text>
                <Text style={styles.muted10}>{s.s}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.warnBox}>
        <MaterialIcons name="warning" size={15} color={color.warn} />
        <Text style={styles.warnTxt}>
          반도체·IT 비중 55% — 업황 단일 변수에 포트폴리오가 좌우됩니다. 위험 회피 레짐에서는 분산 보강을 권장합니다.
        </Text>
      </View>

      {/* 보유 진단 */}
      <View style={{ gap: 10 }}>
        <Text style={styles.cardTitleLg}>보유 종목 진단</Text>
        {diags.map((d) => {
          const v = d.verdict === '—' ? { bg: color.surface3, fg: color.textTertiary } : verdictColors(d.verdict);
          const a = ACTION[d.action];
          return (
            <View key={d.name} style={styles.diagCard}>
              <View style={styles.spread}>
                <View style={styles.rowTiny}>
                  <Text style={styles.diagName}>{d.name}</Text>
                  {d.code ? <Text style={styles.muted11}>{d.code}</Text> : null}
                </View>
                <View style={styles.rowEnd}>
                  <Text style={{ color: color.accent, fontSize: 15, fontWeight: '700' }}>{d.weight}</Text>
                  <Text style={styles.muted10}>비중</Text>
                </View>
              </View>
              <View style={styles.diagBot}>
                <View style={styles.rowTiny}>
                  <View style={[styles.vPill, { backgroundColor: v.bg }]}>
                    <Text style={{ color: v.fg, fontSize: 10, fontWeight: '700' }}>{d.verdict}</Text>
                  </View>
                  <Text style={styles.muted11}>{d.detail}</Text>
                </View>
                <View style={[styles.actionPill, { backgroundColor: a.bg }]}>
                  <Text style={{ color: a.fg, fontSize: 11, fontWeight: '700' }}>{d.actionLabel}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowEnd: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  row10: { flexDirection: 'row', gap: 10 },
  muted10: { color: color.textTertiary, fontSize: 10, fontWeight: '500' },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  cardTitle: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  cardTitleLg: { color: color.textPrimary, fontSize: 15, fontWeight: '700' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  gradeBody: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  gradeBadge: {
    width: 84,
    height: 84,
    borderRadius: 999,
    backgroundColor: color.accentSoft,
    borderWidth: 2,
    borderColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeTxt: { color: color.accent, fontSize: 32, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkName: { width: 38, color: color.textPrimary, fontSize: 12, fontWeight: '700' },

  statCell: {
    flex: 1,
    gap: 4,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: radius.inner,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  warnBox: {
    flexDirection: 'row',
    gap: 9,
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: radius.inner,
    backgroundColor: color.warnSoft,
    borderWidth: 1,
    borderColor: color.warnBorder,
  },
  warnTxt: { flex: 1, color: color.warn, fontSize: 12, fontWeight: '600', lineHeight: 18 },

  diagCard: { gap: 9, padding: 14, borderRadius: radius.inner, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  diagName: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  diagBot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: 9,
  },
  vPill: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  actionPill: { borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 11 },
});
