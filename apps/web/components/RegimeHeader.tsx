// ② 국면 적응 — 추천 상단에 "지금 시장 국면 → 그래서 이 종류를 추천"을 명시(알파 노하우).
// 2축 레짐(상승/하락/횡보/전환)을 사용자 언어로. 순수 서버 컴포넌트.
import type { MarketStateView } from "@/lib/data";

const STATE: Record<
  string,
  { icon: string; name: string; routing: string; cls: string }
> = {
  uptrend: {
    icon: "📈",
    name: "상승추세",
    routing: "추세 추천 활성 — 칼만·메디안·돌파 위주",
    cls: "border-good/30 bg-good-soft text-good",
  },
  downtrend: {
    icon: "📉",
    name: "하락추세",
    routing: "추세 추천 억제 — 수급·역추세 위주 (손실 회피)",
    cls: "border-bad/30 bg-bad-soft text-bad",
  },
  range: {
    icon: "↔️",
    name: "횡보(레인지)",
    routing: "평균회귀·수급 위주 — 추세 추격 자제",
    cls: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  transition: {
    icon: "🔀",
    name: "방향 전환 구간",
    routing: "보수적 — 수급·검증 통과분 위주",
    cls: "border-warn/30 bg-warn-soft text-warn",
  },
};

export function RegimeHeader({ state }: { state: MarketStateView | null }) {
  if (!state) return null;
  const s = STATE[state.market_state ?? ""] ?? STATE.transition;
  return (
    <div className={`mb-4 rounded-[14px] border px-4 py-3 ${s.cls}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-sm font-bold">
          {s.icon} 지금 시장: {s.name}
        </span>
        <span className="text-[12px] font-medium opacity-90">→ {s.routing}</span>
      </div>
      {state.drivers.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {state.drivers.slice(0, 3).map((d, i) => (
            <span
              key={i}
              className="rounded-[999px] bg-black/20 px-2 py-0.5 text-[10px] opacity-90"
            >
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
