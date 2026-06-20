// 가벼운 SVG 미니 알파존 일봉 차트 (그리드 카드용 · 의존성/클라이언트 JS 없음).
// 일봉 캔들 + 채워진 존(목표/알파) + 손절/진입/목표 가격선.
// 종목상세의 lightweight-charts 와 달리 비인터랙티브 — 다수 카드에 가볍게 렌더.
import type { MiniBar } from "@/lib/data";

const UP = "#2ebd85";
const DOWN = "#f6465d";

export function AlphaZoneMini({
  bars,
  entry,
  stop,
  tp1,
  tp2,
  width = 280,
  height = 132,
}: {
  bars: MiniBar[];
  entry: number;
  stop: number;
  tp1?: number | null;
  tp2?: number | null;
  width?: number;
  height?: number;
}) {
  if (!bars || bars.length < 2) {
    return <div style={{ width: "100%", height }} className="rounded-md bg-surface-2" />;
  }

  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const top = tp2 ?? tp1 ?? Math.max(...highs, entry);
  const lo = Math.min(stop, ...lows);
  const hi = Math.max(top, ...highs);
  const pad = (hi - lo) * 0.08;
  const yMax = hi + pad;
  const yMin = lo - pad;
  const span = yMax - yMin || 1;

  const y = (v: number) => ((yMax - v) / span) * height;
  const slot = width / bars.length;
  const cx = (i: number) => slot * (i + 0.5);
  const bodyW = Math.max(1.5, slot * 0.62);

  // 존 사각형 (가격대 → y)
  const band = (a: number, b: number) => {
    const yA = y(Math.max(a, b));
    const yB = y(Math.min(a, b));
    return { y: yA, h: Math.max(0, yB - yA) };
  };
  const target1 = tp1 != null ? band(entry, tp1) : null;
  const target2 = tp1 != null && tp2 != null ? band(tp1, tp2) : null;
  const alpha = band(stop, entry);

  const lineRow = (v: number | null | undefined, color: string, dash?: boolean) =>
    v == null ? null : (
      <line
        x1={0}
        x2={width}
        y1={y(v)}
        y2={y(v)}
        stroke={color}
        strokeWidth={1}
        strokeDasharray={dash ? "3 3" : undefined}
        opacity={0.85}
      />
    );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block"
    >
      {/* 존 밴드 */}
      {target2 && (
        <rect x={0} y={target2.y} width={width} height={target2.h} fill="rgba(46,189,133,0.07)" />
      )}
      {target1 && (
        <rect x={0} y={target1.y} width={width} height={target1.h} fill="rgba(46,189,133,0.14)" />
      )}
      <rect x={0} y={alpha.y} width={width} height={alpha.h} fill="rgba(61,123,255,0.13)" />

      {/* 가격선 */}
      {lineRow(tp1, UP)}
      {lineRow(entry, "#3d7bff", true)}
      {lineRow(stop, DOWN, true)}

      {/* 일봉 캔들 */}
      {bars.map((b, i) => {
        const color = b.c >= b.o ? UP : DOWN;
        const x = cx(i);
        const yHigh = y(b.h);
        const yLow = y(b.l);
        const yO = y(b.o);
        const yC = y(b.c);
        const bodyTop = Math.min(yO, yC);
        const bodyH = Math.max(0.8, Math.abs(yC - yO));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1} />
            <rect
              x={x - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}
