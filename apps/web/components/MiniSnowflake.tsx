// 카드용 미니 스노우플레이크 — 라벨 없는 작은 5각형. 종목 상세의 SnowflakePanel 축약판.
// 순수 SVG(클라이언트 훅 없음) → 서버·클라이언트 컴포넌트 양쪽에서 사용 가능.
import type { SnowflakeAxis } from "@/lib/snowflake";

const C = { cx: 33, cy: 31, R: 25 };
const ANG = [-90, -18, 54, 126, 198].map((d) => (d * Math.PI) / 180);
const ring = (s: number) =>
  ANG.map(
    (a) => `${(C.cx + Math.cos(a) * C.R * s).toFixed(1)},${(C.cy + Math.sin(a) * C.R * s).toFixed(1)}`,
  ).join(" ");

export function MiniSnowflake({
  axes,
  size = 66,
}: {
  axes: SnowflakeAxis[];
  size?: number;
}) {
  if (!axes || axes.length < 5) return null;
  const data = axes
    .map((a, i) => {
      const r = (a.score / 100) * C.R;
      return `${(C.cx + Math.cos(ANG[i]) * r).toFixed(1)},${(C.cy + Math.sin(ANG[i]) * r).toFixed(1)}`;
    })
    .join(" ");
  const weak = axes.some((a) => a.score < 45);

  return (
    <svg
      width={size}
      height={size * (62 / 66)}
      viewBox="0 0 66 62"
      role="img"
      aria-label={axes.map((a) => `${a.label} ${a.score}`).join(", ")}
    >
      <title>{axes.map((a) => `${a.label} ${a.score}`).join(" · ")}</title>
      <polygon points={ring(1)} fill="none" stroke="rgba(255,255,255,0.12)" />
      <polygon points={ring(0.5)} fill="none" stroke="rgba(255,255,255,0.07)" />
      <polygon points={data} fill="rgba(198,242,78,0.20)" stroke={weak ? "#E8C45A" : "#C6F24E"} strokeWidth={1.5} />
    </svg>
  );
}
