import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';

import { color, radius } from '@/theme/tokens';

const AXES = ['밸류', '수급', '모멘텀', '성장', '안정성'];
const CX = 60;
const CY = 60;
const R = 50;

function pt(r: number, k: number): [number, number] {
  const a = ((-90 + 72 * k) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function polyPoints(r: number) {
  return [0, 1, 2, 3, 4].map((k) => pt(r, k).map((n) => n.toFixed(1)).join(',')).join(' ');
}
function dataPoints(scores: number[]) {
  return scores
    .map((s, k) => pt((R * s) / 100, k).map((n) => n.toFixed(1)).join(','))
    .join(' ');
}

export type Snowflake5Data = {
  scores: number[]; // 5개 (밸류·수급·모멘텀·성장·안정성)
  health: number;
  score: number;
};

export function Snowflake5({ data, surface = false }: { data: Snowflake5Data; surface?: boolean }) {
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: surface ? color.surface2 : color.surface, borderWidth: surface ? 0 : 1 },
      ]}>
      <View style={styles.head}>
        <Text style={styles.title}>Stock-Alpha 5축</Text>
        <View style={styles.healthBadge}>
          <Text style={styles.healthTxt}>건강 {data.health} / 100</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.radarBox}>
          <Svg width={120} height={120} viewBox="0 0 120 120">
            {[R, R * 0.66, R * 0.33].map((r, i) => (
              <Polygon key={i} points={polyPoints(r)} fill="none" stroke={color.border} strokeWidth={1} />
            ))}
            {[0, 1, 2, 3, 4].map((k) => {
              const [x, y] = pt(R, k);
              return <Line key={k} x1={CX} y1={CY} x2={x} y2={y} stroke={color.borderSoft} strokeWidth={1} />;
            })}
            <Polygon
              points={dataPoints(data.scores)}
              fill={color.accentSoft}
              stroke={color.accent}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.centerScore}>{data.score}</Text>
        </View>
        <View style={styles.axes}>
          {AXES.map((label, k) => {
            const v = data.scores[k];
            const fill = v >= 70 ? color.good : color.accent;
            return (
              <View key={label} style={styles.axisRow}>
                <Text style={styles.axisLabel}>{label}</Text>
                <View style={styles.track}>
                  <View style={{ width: `${v}%`, height: 7, borderRadius: 4, backgroundColor: fill }} />
                </View>
                <Text style={styles.axisValue}>{v}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    padding: 16,
    borderRadius: radius.inner,
    borderColor: color.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 13, fontWeight: '700', color: color.textPrimary },
  healthBadge: {
    backgroundColor: color.goodSoft,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  healthTxt: { color: color.good, fontSize: 11, fontWeight: '700' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  radarBox: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  centerScore: {
    position: 'absolute',
    color: color.accent,
    fontSize: 26,
    fontWeight: '700',
  },
  axes: { flex: 1, gap: 9 },
  axisRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  axisLabel: { width: 42, color: color.textSecondary, fontSize: 11, fontWeight: '600' },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: color.surface3, overflow: 'hidden' },
  axisValue: { width: 22, textAlign: 'right', color: color.textPrimary, fontSize: 11, fontWeight: '700' },
});
