// 의존성 없는 미니 스파크라인 (SVG)
export function Sparkline({
  data,
  width = 64,
  height = 22,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  const color = up ? "var(--bull)" : "var(--bear)";
  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
