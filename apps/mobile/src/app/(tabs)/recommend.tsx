import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { PickCard } from '@/components/pick-card';
import { Screen } from '@/components/screen';
import { Card } from '@/components/ui';
import { pipeline, recommendMeta } from '@/data/recommend';
import { getRecommendedPicks } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';
import { picks as SAMPLE_PICKS } from '@/data/recommend';
import { color, radius } from '@/theme/tokens';

const TAG: Record<string, { bg: string; fg: string }> = {
  bad: { bg: color.badSoft, fg: color.bad },
  good: { bg: color.goodSoft, fg: color.good },
  accent: { bg: color.accentSoft, fg: color.accent },
};

export default function RecommendScreen() {
  const router = useRouter();
  const { data: picks, loading, isSample } = useQuery(getRecommendedPicks, SAMPLE_PICKS);

  return (
    <Screen gap={20}>
      <View style={styles.headerRow}>
        <View style={styles.rowCenter}>
          <Text style={styles.title}>추천</Text>
          {isSample ? (
            <View style={styles.sampleTag}>
              <Text style={styles.sampleTxt}>샘플</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.regimePill}>
          <MaterialIcons name="trending-down" size={15} color={color.bad} />
          <Text style={{ color: color.bad, fontSize: 12, fontWeight: '700' }}>{recommendMeta.regimePill}</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>{recommendMeta.subtitle}</Text>

      {/* 레짐 밴드 */}
      <View style={styles.band}>
        <View style={styles.rowCenter}>
          <MaterialIcons name="trending-down" size={16} color={color.bad} />
          <Text style={{ color: color.bad, fontSize: 14, fontWeight: '700' }}>{recommendMeta.band.title}</Text>
        </View>
        <Text style={styles.bandDetail}>{recommendMeta.band.detail}</Text>
      </View>

      {/* 선정 파이프라인 */}
      <View style={{ gap: 8 }}>
        <Text style={styles.sectionTitle}>픽 선정 파이프라인</Text>
        {pipeline.map((s) => (
          <View
            key={s.n}
            style={[
              styles.step,
              { backgroundColor: s.accent ? color.accentSoft : color.surface2, borderColor: s.accent ? color.accent : color.border },
            ]}>
            <View style={styles.rowCenter}>
              <View style={[styles.numBadge, { backgroundColor: s.accent ? color.accent : color.surface3 }]}>
                <Text style={{ color: s.accent ? color.textOnAccent : color.textSecondary, fontSize: 11, fontWeight: '800' }}>
                  {s.n}
                </Text>
              </View>
              <Text style={styles.stepTitle}>{s.title}</Text>
            </View>
            <Text style={styles.stepDesc}>{s.desc}</Text>
            <View style={[styles.tag, { backgroundColor: TAG[s.tagKind].bg }]}>
              <Text style={{ color: TAG[s.tagKind].fg, fontSize: 11, fontWeight: '700' }}>{s.tag}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* 픽 카드 — 검증 미달이면 빈 날 */}
      {!loading && !isSample && picks.length === 0 ? (
        <Card style={{ gap: 6 }} padding={20}>
          <Text style={styles.sectionTitle}>오늘은 발행된 픽이 없습니다</Text>
          <Text style={styles.bandDetail}>
            검증 게이트를 통과한 셋업이 없어 픽을 발행하지 않았습니다 — 무리한 진입보다 현금이 알파입니다.
          </Text>
        </Card>
      ) : (
        picks.map((p) => (
          <PickCard
            key={p.code}
            pick={p}
            onReport={() => router.push({ pathname: '/report/[id]', params: { id: p.code } })}
          />
        ))
      )}

      {/* 푸시 미리보기 */}
      <Card accent style={{ gap: 9 }} padding={16}>
        <View style={styles.rowTiny}>
          <MaterialIcons name="smartphone" size={14} color={color.accent} />
          <Text style={styles.pushHead}>푸시 알림 — 이렇게 옵니다</Text>
        </View>
        <Text style={styles.pushTitle}>{recommendMeta.push.title}</Text>
        <Text style={styles.pushBody}>{recommendMeta.push.body}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: color.textPrimary, fontSize: 26, fontWeight: '700' },
  sampleTag: {
    backgroundColor: color.surface3,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  sampleTxt: { color: color.textTertiary, fontSize: 10, fontWeight: '700' },
  regimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.badSoft,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  subtitle: { color: color.textSecondary, fontSize: 13, fontWeight: '500', lineHeight: 18 },

  band: {
    gap: 6,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.bad,
  },
  bandDetail: { color: color.textSecondary, fontSize: 12, fontWeight: '500', lineHeight: 17 },

  sectionTitle: { color: color.textPrimary, fontSize: 15, fontWeight: '700' },
  step: { gap: 7, padding: 14, paddingHorizontal: 16, borderRadius: radius.inner, borderWidth: 1 },
  numBadge: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { color: color.textPrimary, fontSize: 13, fontWeight: '700' },
  stepDesc: { color: color.textSecondary, fontSize: 11, fontWeight: '500', lineHeight: 16 },
  tag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },

  pushHead: { color: color.textTertiary, fontSize: 11, fontWeight: '600' },
  pushTitle: { color: color.accent, fontSize: 14, fontWeight: '700' },
  pushBody: { color: color.textSecondary, fontSize: 13, fontWeight: '500', lineHeight: 18 },
});
