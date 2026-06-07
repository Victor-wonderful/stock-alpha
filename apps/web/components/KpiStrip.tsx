import type { SignalView } from "@/lib/types";

// 시그널 집계 KPI 스트립 — 상단 밀도/요약
export function KpiStrip({ rows }: { rows: SignalView[] }) {
  const n = rows.length;
  const buys = rows.filter((r) => r.signal_type === "buy").length;
  const avgRR =
    n > 0 ? rows.reduce((a, r) => a + (r.risk_reward ?? 0), 0) / n : 0;
  const avgStrength =
    n > 0 ? rows.reduce((a, r) => a + r.strength, 0) / n : 0;
  const setups = new Set(rows.map((r) => r.setup)).size;

  const items = [
    { label: "활성 시그널", value: String(n), tone: "" },
    { label: "매수 / 비중", value: `${buys} / ${n}`, tone: "text-bull" },
    { label: "평균 R:R", value: avgRR.toFixed(2), tone: "" },
    { label: "평균 신뢰도", value: `${Math.round(avgStrength * 100)}%`, tone: "text-accent" },
    { label: "플레이북", value: `${setups}종`, tone: "" },
  ];

  return (
    <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-lg border border-border bg-surface sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={`px-4 py-3 ${i >= 3 ? "border-t border-border lg:border-t-0" : ""}`}
        >
          <p className="text-2xs uppercase tracking-wide text-text-mute">{it.label}</p>
          <p className={`tnum mt-1 text-xl font-semibold ${it.tone}`}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}
