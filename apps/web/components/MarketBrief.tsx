import type { MarketBreadth, MarketCondition } from "@/lib/data";

// 오늘의 시황 — '전망'이 아니라 '오늘 무슨 일이 있었나 + 과거엔 이랬다'.
//
// 왜 예측을 안 하나 (2026-08-16 측정, 합성 지수 442 거래일):
//   아무것도 안 보고 매일 "오른다"고 해도 적중률 55.3% 다. 이 시장이 그 기간 상승
//   편향이었기 때문이다. "상승 전망"이라 쓰면 55%가 맞는데 사용자는 그걸 시스템의
//   실력으로 읽는다. 조건별 차이는 대부분 기준선 대비 1~2%p — 노이즈다.
//   그래서 공시 성적표(event_evidence)와 같은 방식으로 간다: 과거 빈도를 표본 수와
//   함께 그대로 보여주고, 판단은 사용자가 한다.
//
// ⚠️ up_rate 를 보여줄 땐 기준선을 반드시 옆에 둘 것. 기준선 없는 "67%"는 거짓말에 가깝다.

function pct(x: number | null | undefined, digits = 0): string {
  if (x == null) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

function ConditionRow({
  c,
  baselineUp,
  baselineRet,
}: {
  c: MarketCondition;
  baselineUp: number | null;
  baselineRet: number | null;
}) {
  const up = c.up_rate_1d ?? null;
  const diff = up != null && baselineUp != null ? (up - baselineUp) * 100 : null;
  // 3%p 미만 차이는 엣지로 취급하지 않는다 — 표본 수십~수백 건에서 그 정도는 노이즈다.
  const meaningful = diff != null && Math.abs(diff) >= 3;
  const weaker =
    c.avg_ret_5d != null && baselineRet != null && c.avg_ret_5d < baselineRet;

  return (
    <li className="border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[14px] text-text">{c.condition}</span>
        <span className="text-[11px] text-text-mute">과거 {c.n}회</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px]">
        <span className="text-text-dim">다음날 상승</span>
        <span
          className={
            meaningful
              ? diff! > 0
                ? "text-good font-medium"
                : "text-bad font-medium"
              : "text-text font-medium"
          }
        >
          {pct(up)}
        </span>
        <span className="text-text-mute">
          (조건 없이 {pct(baselineUp)}
          {meaningful
            ? `, ${Math.abs(diff!).toFixed(0)}%p ${diff! > 0 ? "높음" : "낮음"}`
            : ", 사실상 같음"}
          )
        </span>
      </div>
      {weaker && (
        <p className="mt-1 text-[12px] text-warn">
          다만 5일 수익률은 평균보다 낮았습니다 — 방향은 이어져도 폭은 줄었습니다.
        </p>
      )}
    </li>
  );
}

export function MarketBrief({
  market,
  headline,
  marketView,
}: {
  market: MarketBreadth | null;
  headline?: string;
  marketView?: string;
}) {
  if (!market) return null;

  const total = market.advancers + market.decliners;
  const upShare = total > 0 ? market.advancers / total : 0.5;
  const base = market.baseline ?? null;
  const prevUp =
    market.prev_breadth != null ? market.prev_breadth : null;

  return (
    <section aria-labelledby="market-brief-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="market-brief-h" className="text-[16px] font-semibold text-text">
          오늘의 시황
        </h2>
        <span className="text-[11px] text-text-mute">
          {market.as_of} 종가 · 전 종목 {market.instruments.toLocaleString()}개 집계
        </span>
      </div>

      {headline && (
        <p className="mt-3 text-[15px] leading-relaxed text-text">{headline}</p>
      )}

      {/* 시장 폭 — 오늘 오른 종목과 내린 종목. 지수 한 줄보다 이게 '장이 어땠나'에 가깝다. */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[12px] text-text-dim">
          <span>
            오른 종목{" "}
            <span className="text-good font-medium">
              {market.advancers.toLocaleString()}
            </span>
          </span>
          <span className="text-text-mute">
            동일가중 {market.market_ret >= 0 ? "+" : ""}
            {(market.market_ret * 100).toFixed(2)}%
          </span>
          <span>
            <span className="text-bad font-medium">
              {market.decliners.toLocaleString()}
            </span>{" "}
            내린 종목
          </span>
        </div>
        <div
          className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-3"
          role="img"
          aria-label={`오른 종목 ${market.advancers}개, 내린 종목 ${market.decliners}개`}
        >
          <div
            className="bg-good"
            style={{ width: `${(upShare * 100).toFixed(1)}%` }}
          />
          <div
            className="bg-bad"
            style={{ width: `${((1 - upShare) * 100).toFixed(1)}%` }}
          />
        </div>
        {prevUp != null && (
          <p className="mt-1.5 text-[11px] text-text-mute">
            전일 상승 비율 {pct(prevUp)} → 오늘 {pct(market.breadth)}
          </p>
        )}
      </div>

      {marketView && (
        <p className="mt-4 text-[13px] leading-relaxed text-text-dim">
          {marketView}
        </p>
      )}

      {/* 조건부 실측 — 예측이 아니라 과거 빈도. 기준선을 항상 옆에 둔다. */}
      <div className="mt-5">
        <p className="text-[12px] text-text-mute">
          지금과 같은 상황이 과거엔 어땠나
          <span className="ml-1.5">
            (최근 {market.lookback_days.toLocaleString()}거래일)
          </span>
        </p>
        {market.conditions.length > 0 ? (
          <ul className="mt-2">
            {market.conditions.map((c) => (
              <li key={c.condition} className="list-none">
                <ConditionRow
                  c={c}
                  baselineUp={base?.up_rate_1d ?? null}
                  baselineRet={base?.avg_ret_5d ?? null}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-text-dim">
            오늘은 과거 빈도를 말할 만한 특이 조건이 없습니다.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-text-mute">
          과거 빈도이지 전망이 아닙니다. 표본이 30회 미만인 조건은 표시하지 않습니다.
        </p>
      </div>
    </section>
  );
}
