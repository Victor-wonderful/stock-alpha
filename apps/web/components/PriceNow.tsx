import { fmtPrice, fmtPct } from "@/lib/format";

// 픽·종목의 '현재가 + 전일대비' 표시. 홈·추천이 같은 모양을 쓰도록 공용화.
//
// 실시간이 아니다 — 일봉(ohlcv) 최신 종가 기준이라 장중에는 전일 종가가 보인다.
// 그래서 기준일(date)을 title 로 항상 달아 둔다. 낡은 값을 현재가로 오인하는 사고를
// 막는 원칙은 리스크 지표(기준일 노출)와 동일하다.
export function PriceNow({
  close,
  changePct,
  date,
  size = "sm",
  label = "현재",
}: {
  close: number | null | undefined;
  changePct: number | null | undefined;
  date?: string | null;
  size?: "sm" | "xs";
  /** 진입가·목표가와 나란히 놓일 때 어느 값인지 구분되도록. null 이면 라벨 생략. */
  label?: string | null;
}) {
  if (close == null) return null;
  const up = (changePct ?? 0) >= 0;
  const priceCls = size === "xs" ? "text-[11px]" : "text-[13px]";
  const pctCls = size === "xs" ? "text-[10px]" : "text-[11px]";
  return (
    <span
      className="inline-flex items-baseline gap-1 whitespace-nowrap"
      title={date ? `${date} 종가 기준 (장중 실시간 아님)` : undefined}
    >
      {label && (
        <span className={`text-text-mute ${pctCls}`}>{label}</span>
      )}
      <span className={`tnum font-bold text-text ${priceCls}`}>{fmtPrice(close)}</span>
      {changePct != null && (
        <span className={`tnum font-semibold ${pctCls} ${up ? "text-good" : "text-bad"}`}>
          {fmtPct(changePct)}
        </span>
      )}
    </span>
  );
}
