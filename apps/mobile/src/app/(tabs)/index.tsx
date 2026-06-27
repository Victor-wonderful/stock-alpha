import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Card, Dot, IconButton, Pill, SectionHeader } from '@/components/ui';
import {
  focusPicks as SAMPLE_FOCUS,
  gates,
  heroStat,
  markets,
  reports,
  trackRecord,
  verdictDist,
} from '@/data/home';
import { getFocusPicks } from '@/lib/queries';
import { useQuery } from '@/lib/use-query';
import { color, radius } from '@/theme/tokens';

const STYLE_COLOR: Record<string, string> = {
  스윙: color.accent,
  데이: '#4D9FFF',
  포지션: color.warn,
};

export default function HomeScreen() {
  const router = useRouter();
  const { data: focusPicks } = useQuery(getFocusPicks, SAMPLE_FOCUS);

  return (
    <Screen gap={24}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoMark}>α</Text>
          </View>
          <Text style={styles.brandName}>Stock Alpha</Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon="search" />
          <IconButton icon="notifications" onPress={() => router.push('/alerts')} />
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>S</Text>
          </View>
        </View>
      </View>

      {/* 타이틀 + New Pick */}
      <View style={styles.titleRow}>
        <View style={{ gap: 4 }}>
          <Text style={styles.date}>2026년 6월 26일 (금) · 장 마감</Text>
          <Text style={styles.title}>대시보드</Text>
        </View>
        <Pressable style={styles.newPick} hitSlop={6}>
          <MaterialIcons name="add" size={18} color={color.textOnAccent} />
          <Text style={styles.newPickLabel}>New Pick</Text>
        </Pressable>
      </View>

      {/* 히어로 카드 */}
      <Card padding={22} style={{ gap: 18 }}>
        <View style={styles.spread}>
          <View style={styles.rowCenter}>
            <MaterialIcons name="trending-up" size={18} color={color.good} />
            <Text style={styles.heroLabel}>{heroStat.label}</Text>
          </View>
          <Pill
            label="실시간"
            bg={color.goodSoft}
            fg={color.good}
            size={11}
            left={<Dot c={color.good} size={6} />}
          />
        </View>
        <View style={styles.heroValRow}>
          <Text style={styles.heroVal}>{heroStat.value}</Text>
          <Text style={styles.heroSub}>{heroStat.sub}</Text>
        </View>
        <View style={styles.kpiRow}>
          {heroStat.kpis.map((k, i) => (
            <View
              key={k.label}
              style={[
                styles.kpiCell,
                { alignItems: i === 0 ? 'flex-start' : i === 1 ? 'center' : 'flex-end' },
              ]}>
              <Text style={[styles.kpiValue, k.accent && { color: color.accent }]}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* 시장 한눈에 */}
      <View style={{ gap: 12 }}>
        <SectionHeader title="시장 한눈에" action="전체" onAction={() => router.push('/market')} />
        <View style={{ gap: 10 }}>
          {[0, 2].map((start) => (
            <View key={start} style={styles.gridRow}>
              {markets.slice(start, start + 2).map((m) => (
                <View key={m.name} style={styles.marketCard}>
                  <Text style={styles.marketName}>{m.name}</Text>
                  <Text style={styles.marketValue}>{m.value}</Text>
                  <View style={styles.rowCenterTiny}>
                    <MaterialIcons
                      name={m.up ? 'arrow-drop-up' : 'arrow-drop-down'}
                      size={16}
                      color={m.up ? color.good : color.bad}
                    />
                    <Text style={{ color: m.up ? color.good : color.bad, fontSize: 12, fontWeight: '600' }}>
                      {m.change}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* 오늘의 포커스 */}
      <View style={{ gap: 12 }}>
        <SectionHeader
          title="오늘의 포커스"
          action="추천 전체"
          actionColor={color.accent}
          onAction={() => router.push('/recommend')}
        />
        <View style={{ gap: 10 }}>
          {focusPicks.map((p) => (
            <Pressable
              key={p.code}
              onPress={() => router.push({ pathname: '/stock/[code]', params: { code: p.code } })}
              style={styles.focusCard}>
              <View style={styles.focusAvatar}>
                <Text style={styles.focusAvatarTxt}>{p.name.slice(0, 2)}</Text>
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                <View style={styles.rowCenter}>
                  <Text style={styles.focusName}>{p.name}</Text>
                  <View style={styles.styleBadge}>
                    <Text style={{ color: STYLE_COLOR[p.style], fontSize: 10, fontWeight: '600' }}>
                      {p.style}
                    </Text>
                  </View>
                </View>
                <View style={styles.rowCenterTiny}>
                  <Text style={styles.muted11}>{p.code}</Text>
                  <Text style={styles.muted11}>·</Text>
                  <Text style={[styles.muted11, { color: color.textSecondary }]}>{p.entry}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <Text style={{ color: color.good, fontSize: 14, fontWeight: '700' }}>TP {p.tp}</Text>
                <View style={styles.rowCenterTiny}>
                  <Text style={styles.muted10}>점수</Text>
                  <Text style={{ color: color.accent, fontSize: 12, fontWeight: '700' }}>{p.score}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 최신 분석 리포트 */}
      <View style={{ gap: 12 }}>
        <SectionHeader title="최신 분석 리포트" action="전체" />
        <Card padding={0} style={{ paddingHorizontal: 16 }}>
          {reports.map((r, i) => (
            <Pressable
              key={r.name}
              onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.name } })}
              style={[styles.reportRow, i > 0 && styles.topBorder]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.reportName}>{r.name}</Text>
                <Text style={styles.muted11}>{r.line}</Text>
              </View>
              <View style={styles.scoreSquare}>
                <Text
                  style={{
                    color: r.tone === 'good' ? color.good : color.warn,
                    fontSize: 16,
                    fontWeight: '700',
                  }}>
                  {r.score}
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      </View>

      {/* 오늘의 판정 분포 */}
      <Card style={{ gap: 12 }}>
        <Text style={styles.cardTitle}>오늘의 판정 분포</Text>
        <View style={styles.verdictBar}>
          <View style={{ flex: verdictDist.buy.count, backgroundColor: color.accent }} />
          <View style={{ flex: verdictDist.neutral.count, backgroundColor: '#9CA0A8' }} />
          <View style={{ flex: verdictDist.watch.count, backgroundColor: color.surface3 }} />
        </View>
        <View style={styles.spread}>
          {[
            { ...verdictDist.buy, c: color.accent },
            { ...verdictDist.neutral, c: '#9CA0A8' },
            { ...verdictDist.watch, c: color.surface3 },
          ].map((v) => (
            <View key={v.label} style={styles.rowCenterTiny}>
              <Dot c={v.c} size={8} />
              <Text style={{ color: color.textSecondary, fontSize: 12 }}>{v.label}</Text>
              <Text style={{ color: color.textPrimary, fontSize: 12, fontWeight: '700' }}>
                {v.count}건
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* 픽 트랙레코드 */}
      <Card style={{ gap: 12 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>픽 트랙레코드</Text>
          <Text style={styles.muted11}>{trackRecord.sub}</Text>
        </View>
        <View style={{ gap: 8 }}>
          {[0, 2].map((start) => (
            <View key={start} style={styles.gridRow}>
              {trackRecord.cells.slice(start, start + 2).map((c) => (
                <View key={c.label} style={styles.trackCell}>
                  <Text style={styles.muted11}>{c.label}</Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '700',
                      color:
                        c.tone === 'good' ? color.good : c.tone === 'bad' ? color.bad : color.textPrimary,
                    }}>
                    {c.value}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <View style={styles.trackFoot}>
          <Text style={{ color: color.textSecondary, fontSize: 12, fontWeight: '600' }}>
            확정 픽 평균 수익률
          </Text>
          <Text style={{ color: color.accent, fontSize: 15, fontWeight: '700' }}>{trackRecord.avg}</Text>
        </View>
      </Card>

      {/* 전략 검증 현황 */}
      <Card style={{ gap: 12 }}>
        <SectionHeader title="전략 검증 현황" action="검증 상세" actionColor={color.accent} />
        {gates.map((g) => (
          <View key={g.name} style={styles.gateRow}>
            <Text style={{ color: color.textSecondary, fontSize: 13 }}>{g.name}</Text>
            <View style={styles.rowCenter}>
              {g.ev ? (
                <Text style={{ color: color.textPrimary, fontSize: 12, fontWeight: '600' }}>{g.ev}</Text>
              ) : null}
              <Pill
                label={g.status}
                bg={g.pass ? color.goodSoft : color.warnSoft}
                fg={g.pass ? color.good : color.warn}
              />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowCenterTiny: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: color.textPrimary },
  muted11: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
  muted10: { color: color.textTertiary, fontSize: 10, fontWeight: '500' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMark: { color: color.textOnAccent, fontSize: 16, fontWeight: '700' },
  brandName: { color: color.textPrimary, fontSize: 17, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: color.accent, fontSize: 14, fontWeight: '700' },

  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  date: { color: color.textTertiary, fontSize: 12, fontWeight: '500' },
  title: { color: color.textPrimary, fontSize: 26, fontWeight: '700' },
  newPick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.accent,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 15,
  },
  newPickLabel: { color: color.textOnAccent, fontSize: 13, fontWeight: '700' },

  heroLabel: { color: color.textSecondary, fontSize: 13, fontWeight: '600' },
  heroValRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  heroVal: { color: color.good, fontSize: 40, fontWeight: '700', lineHeight: 44 },
  heroSub: { color: color.textTertiary, fontSize: 13, fontWeight: '500', marginBottom: 8 },
  kpiRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    paddingTop: 16,
  },
  kpiCell: { flex: 1, gap: 5 },
  kpiValue: { color: color.textPrimary, fontSize: 18, fontWeight: '700' },
  kpiLabel: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },

  gridRow: { flexDirection: 'row', gap: 10 },
  marketCard: {
    flex: 1,
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.inner,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  marketName: { color: color.textSecondary, fontSize: 12, fontWeight: '600' },
  marketValue: { color: color.textPrimary, fontSize: 19, fontWeight: '700' },

  focusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.inner,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  focusAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusAvatarTxt: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  focusName: { color: color.textPrimary, fontSize: 15, fontWeight: '700' },
  styleBadge: { backgroundColor: color.surface3, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },

  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  topBorder: { borderTopWidth: 1, borderTopColor: color.borderSoft },
  reportName: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  scoreSquare: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },

  verdictBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.pill,
    overflow: 'hidden',
    gap: 3,
  },

  trackCell: {
    flex: 1,
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.inner,
    backgroundColor: color.surface2,
  },
  trackFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.inner,
    backgroundColor: color.accentSoft,
  },

  gateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
