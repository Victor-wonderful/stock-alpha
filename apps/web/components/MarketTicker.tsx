import { fmtPct } from "@/lib/format";

export type TickerItem = {
  id: string;
  label: string;
  value: number;
  unit?: string;
  /** 변화량. isPct 면 비율(0.012 = +1.2%)로, 아니면 절대값으로 읽는다. */
  change?: number | null;
  isPct?: boolean;
};

/**
 * 가로로 흐르는 지표 띠.
 *
 * 홈 상단에만 있던 것을 컴포넌트로 뺐다(2026-08-23 Victor: 시장 페이지의 매크로
 * 지표도 "홈에 보면 위에서 움직이는 모양으로 해놓은 것처럼" 하라).
 *
 * 왜 카드 그리드보다 나은가 — 지표 6개는 «훑는 값»이지 «비교하는 값»이 아니다.
 * 카드로 세우면 6칸이 화면 한 덩어리를 차지하면서도 각 칸이 하는 말은 한 줄뿐이다.
 * 띠는 같은 정보를 한 줄에 담고, 화면의 나머지를 본문에 내준다.
 *
 * 읽으려면 멈춰야 하니 hover 시 정지한다. 두 벌째는 이음매를 메우는 복제본이라
 * 스크린리더가 같은 값을 두 번 읽지 않게 감춘다.
 */
export function MarketTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="ticker-band no-scrollbar group relative overflow-hidden border-y border-border-soft">
      <div className="flex w-max animate-ticker group-hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex" aria-hidden={copy === 1}>
            {items.map((it) => (
              <TickerCell key={it.id} item={it} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TickerCell({ item }: { item: TickerItem }) {
  const { label, value, unit, change, isPct } = item;
  const up = (change ?? 0) >= 0;
  return (
    <div className="flex w-[190px] shrink-0 items-baseline gap-2 whitespace-nowrap border-r border-border-soft px-4 py-2.5">
      <span className="text-[11px] text-text-mute">{label}</span>
      <span className="tnum text-[14px] font-medium text-text">
        {value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
        {unit && <span className="ml-0.5 text-[11px] text-text-mute">{unit}</span>}
      </span>
      {change != null && (
        <span className={`tnum text-[11px] ${up ? "text-good" : "text-bad"}`}>
          {isPct
            ? fmtPct(change)
            : `${up ? "+" : ""}${change.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`}
        </span>
      )}
    </div>
  );
}
