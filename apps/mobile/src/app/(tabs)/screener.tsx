import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { IconButton } from '@/components/ui';
import { highlights, quickFilters, setupChips, signals, styleTabs, type Signal } from '@/data/screener';
import { color, radius, verdictColors } from '@/theme/tokens';

export default function ScreenerScreen() {
  const router = useRouter();
  return (
    <Screen gap={18}>
      {/* 헤더 */}
      <View style={styles.headerRow}>
        <View style={{ gap: 3 }}>
          <Text style={styles.title}>스크리너</Text>
          <Text style={styles.subtitle}>셋업 트리거 기록 · 매수 추천 아님</Text>
        </View>
        <IconButton icon="swap-vert" />
      </View>

      {/* 하이라이트 2x2 */}
      <View style={{ gap: 10 }}>
        {[0, 2].map((start) => (
          <View key={start} style={styles.row10}>
            {highlights.slice(start, start + 2).map((h) => (
              <View key={h.label} style={styles.hlCard}>
                <View style={styles.spread}>
                  <Text style={styles.hlLabel}>{h.label}</Text>
                  <MaterialIcons name={h.icon} size={15} color={color.accent} />
                </View>
                <Text style={[styles.hlValue, h.accent && { color: color.accent }]}>{h.value}</Text>
                <Text style={styles.muted10}>{h.sub}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* 빠른 필터 */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>빠른 필터</Text>
        {quickFilters.map((q) => (
          <View
            key={q.label}
            style={[
              styles.chip,
              { backgroundColor: q.active ? color.accentSoft : color.surface2, borderColor: q.active ? color.accent : color.border },
            ]}>
            <MaterialIcons name={q.icon} size={14} color={q.active ? color.accent : color.textSecondary} />
            <Text style={{ color: q.active ? color.accent : color.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {q.label}
            </Text>
          </View>
        ))}
      </View>

      {/* 셋업 칩 */}
      <View style={styles.filterRow}>
        {setupChips.map((c) => (
          <View
            key={c.label}
            style={[
              styles.chip,
              { backgroundColor: c.active ? color.accent : color.surface2, borderColor: c.active ? color.accent : color.border },
            ]}>
            <Text style={{ color: c.active ? color.textOnAccent : color.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>

      {/* 스타일 탭 */}
      <View style={styles.filterRow}>
        {styleTabs.map((s) => (
          <View
            key={s.label}
            style={[
              styles.chip,
              { backgroundColor: s.active ? color.surface3 : 'transparent', borderColor: s.active ? color.border : color.borderSoft },
            ]}>
            <Text style={{ color: s.active ? color.textPrimary : color.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {s.label}
            </Text>
          </View>
        ))}
        <View style={[styles.chip, { backgroundColor: 'transparent', borderColor: color.borderSoft }]}>
          <MaterialIcons name="lock" size={12} color={color.textTertiary} />
          <Text style={{ color: color.textTertiary, fontSize: 12, fontWeight: '500' }}>데이·스캘핑</Text>
        </View>
      </View>

      {/* 시그널 카드 */}
      <View style={{ gap: 10 }}>
        {signals.map((s) => (
          <SignalCard
            key={s.code}
            s={s}
            onPress={() => router.push({ pathname: '/stock/[code]', params: { code: s.code } })}
          />
        ))}
      </View>

      {/* 푸터 */}
      <View style={{ gap: 10, alignItems: 'center' }}>
        <Text style={styles.footNote}>
          시그널은 매수 추천이 아닌 셋업 트리거 기록입니다. 진입·청산 판단은 리포트의 실행 플랜을 따르세요.
        </Text>
        <Pressable style={styles.moreBtn} hitSlop={6}>
          <Text style={{ color: color.accent, fontSize: 13, fontWeight: '600' }}>더 보기 (66건)</Text>
          <MaterialIcons name="keyboard-arrow-down" size={16} color={color.accent} />
        </Pressable>
      </View>
    </Screen>
  );
}

function SignalCard({ s, onPress }: { s: Signal; onPress?: () => void }) {
  const v = verdictColors(s.verdict);
  return (
    <Pressable onPress={onPress} style={styles.sigCard}>
      <View style={styles.spread}>
        <View style={styles.rowCenter}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{s.init}</Text>
          </View>
          <View style={{ gap: 2 }}>
            <Text style={styles.sigName}>{s.name}</Text>
            <Text style={styles.muted11}>{s.code}</Text>
          </View>
        </View>
        <View style={styles.rowCenter}>
          <View style={[styles.vPill, { backgroundColor: v.bg }]}>
            <Text style={{ color: v.fg, fontSize: 10, fontWeight: '700' }}>{s.verdict}</Text>
          </View>
          <Text style={styles.sigScore}>{s.score}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <View style={styles.setupPill}>
          <Text style={{ color: color.textSecondary, fontSize: 10, fontWeight: '600' }}>{s.setup}</Text>
        </View>
        <Text style={styles.muted11}>{s.style}</Text>
        <Text style={styles.muted11}>·</Text>
        <Text style={[styles.muted11, { color: color.textSecondary, fontWeight: '600' }]}>합성 {s.alpha}</Text>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
          <Text style={styles.muted11}>R:R</Text>
          <Text style={{ color: color.accent, fontSize: 12, fontWeight: '700' }}>{s.rr}</Text>
        </View>
      </View>

      <View style={styles.prices}>
        <Price label="진입" value={s.entry} />
        <Price label="목표" value={s.target} pct={s.targetPct} pctColor={color.good} />
        <Price label="손절" value={s.stop} pct={s.stopPct} pctColor={color.bad} />
      </View>
    </Pressable>
  );
}

function Price({ label, value, pct, pctColor }: { label: string; value: string; pct?: string; pctColor?: string }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={styles.muted10}>{label}</Text>
      <Text style={{ color: color.textPrimary, fontSize: 13, fontWeight: '700' }}>{value}</Text>
      {pct ? <Text style={{ color: pctColor, fontSize: 10, fontWeight: '600' }}>{pct}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row10: { flexDirection: 'row', gap: 10 },
  muted10: { color: color.textTertiary, fontSize: 10, fontWeight: '500' },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: color.textPrimary, fontSize: 26, fontWeight: '700' },
  subtitle: { color: color.textTertiary, fontSize: 12, fontWeight: '500' },

  hlCard: {
    flex: 1,
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.inner,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  hlLabel: { color: color.textSecondary, fontSize: 11, fontWeight: '500' },
  hlValue: { color: color.textPrimary, fontSize: 20, fontWeight: '700' },

  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  filterLabel: { color: color.textTertiary, fontSize: 12, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },

  sigCard: {
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.inner,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  avatar: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: color.surface3, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: color.textSecondary, fontSize: 11, fontWeight: '700' },
  sigName: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  vPill: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
  sigScore: { color: color.textPrimary, fontSize: 15, fontWeight: '700' },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  setupPill: { backgroundColor: color.surface3, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },

  prices: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: 11,
  },

  footNote: { color: color.textTertiary, fontSize: 11, fontWeight: '500', lineHeight: 16, textAlign: 'center' },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.surface2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
});
