import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Card, Dot, IconButton } from '@/components/ui';
import { channels, feed, type Notif } from '@/data/alerts';
import { color, radius } from '@/theme/tokens';

const TONE: Record<Notif['tone'], { soft: string; ic: string }> = {
  accent: { soft: color.accentSoft, ic: color.accent },
  good: { soft: color.goodSoft, ic: color.good },
  bad: { soft: color.badSoft, ic: color.bad },
  tert: { soft: color.surface3, ic: color.textTertiary },
};

export default function AlertsScreen() {
  return (
    <Screen gap={20}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.title}>알림</Text>
          <Text style={styles.subtitle}>픽 발행 · 시그널 · 목표/손절 도달을 놓치지 않게.</Text>
        </View>
        <IconButton icon="done-all" />
      </View>

      {/* 알림 채널 */}
      <Card style={{ gap: 14 }}>
        <View style={styles.spread}>
          <Text style={styles.cardTitle}>알림 채널</Text>
          <View style={styles.rowTiny}>
            <Text style={{ color: color.accent, fontSize: 12, fontWeight: '600' }}>이벤트 설정</Text>
            <MaterialIcons name="chevron-right" size={15} color={color.accent} />
          </View>
        </View>
        <View style={styles.row8}>
          {channels.map((c) => (
            <View
              key={c.label}
              style={[
                styles.channel,
                { backgroundColor: c.on ? color.accentSoft : color.surface2, borderColor: c.on ? color.accent : color.border },
              ]}>
              <MaterialIcons name={c.icon} size={15} color={c.on ? color.accent : color.textTertiary} />
              <Text style={{ color: c.on ? color.accent : color.textTertiary, fontSize: 12, fontWeight: '600' }}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* 피드 */}
      {feed.map((group) => (
        <View key={group.date} style={{ gap: 10 }}>
          <Text style={styles.dateLabel}>{group.date}</Text>
          {group.items.map((n, i) => {
            const t = TONE[n.tone];
            return (
              <View
                key={i}
                style={[
                  styles.notif,
                  n.unread
                    ? { backgroundColor: color.surface2 }
                    : { borderWidth: 1, borderColor: color.borderSoft },
                ]}>
                <View style={[styles.notifIcon, { backgroundColor: t.soft }]}>
                  <MaterialIcons name={n.icon} size={19} color={t.ic} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.notifTitle, !n.unread && { color: color.textSecondary, fontWeight: '600' }]}>
                    {n.title}
                  </Text>
                  <Text style={styles.notifSub}>{n.sub}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={styles.time}>{n.time}</Text>
                  {n.unread ? <Dot c={color.accent} size={7} /> : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <View style={{ alignItems: 'center', paddingTop: 2 }}>
        <Text style={{ color: color.accent, fontSize: 12, fontWeight: '600' }}>이전 알림 더 보기</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowTiny: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  row8: { flexDirection: 'row', gap: 8 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: color.textPrimary },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { color: color.textPrimary, fontSize: 26, fontWeight: '700' },
  subtitle: { color: color.textSecondary, fontSize: 13, fontWeight: '500', lineHeight: 18 },

  channel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: 9,
  },

  dateLabel: { color: color.textTertiary, fontSize: 11, fontWeight: '600' },
  notif: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.inner,
  },
  notifIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { color: color.textPrimary, fontSize: 13, fontWeight: '700' },
  notifSub: { color: color.textTertiary, fontSize: 11, fontWeight: '500', lineHeight: 15 },
  time: { color: color.textTertiary, fontSize: 11, fontWeight: '500' },
});
