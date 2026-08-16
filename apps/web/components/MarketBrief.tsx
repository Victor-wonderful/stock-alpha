import type { MarketBreadth, MarketCondition } from "@/lib/data";
import { tradingDayLabel } from "@/lib/format";

// 장 마감 시황 — '오늘 예측'이 아니라 '끝난 장의 기록 + 다음 거래일의 전제'.
//
// 이름부터 틀렸었다: 16:30 배치가 종가를 분석한 결과인데 "오늘의 시황"이라 붙여
// 앞을 보는 것처럼 읽혔다. 실제로 앞을 보는 건 조건부 숫자 하나뿐이다 —
// 그것도 픽이 실제로 매매될 '다음 거래일'에 대한 것이다. 그래서 제목은 마감일로,
// 조건은 다음 거래일 날짜로 못 박는다.
//
// 왜 예측을 안 하나 (합성 지수 442거래일 실측):
//   아무것도 안 보고 매일 "오른다"고 해도 적중률 55.3% 다(그 기간 상승 편향).
//   "상승 전망"이라 쓰면 55%가 맞는데 사용자는 그걸 시스템 실력으로 읽는다.
//   → 공시 성적표와 같은 방식: 과거 빈도를 표본 수와 함께 보여주고 판단은 사용자가.
//
// ⚠️ up_rate 를 보여줄 땐 기준선을 반드시 옆에. 기준선 없는 "58%"는 거짓말에 가깝다.
//
// 서술(headline·market_view)은 일부러 렌더하지 않는다 — 아래 구조가 같은 숫자를
// 더 잘 말한다. 텍스트는 payload 에 남아 다른 화면(알림·추천)이 쓴다.

function pct(x: number | null | undefined, digits = 0): string {
  if (x == null) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

function monthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "dim";
}) {
  const color =
    tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-text";
  return (
    <div>
      <div className="text-[11px] tracking-[0.03em] text-text-mute">{label}</div>
      <div
        className={`mt-0.5 text-[28px] leading-[1.15] tracking-[-0.02em] tnum ${color}`}
      >
        {value}
      </div>
    </div>
  );
}

function ConditionBlock({
  c,
  baselineUp,
  baselineRet,
  forDayLabel,
}: {
  c: MarketCondition;
  baselineUp: number | null;
  baselineRet: number | null;
  forDayLabel: string;
}) {
  const up = c.up_rate_1d ?? null;
  const diff = up != null && baselineUp != null ? (up - baselineUp) * 100 : null;
  // 3%p 미만은 엣지로 치지 않는다 — 표본 수십~수백 건에서 그 정도는 노이즈다.
  const meaningful = diff != null && Math.abs(diff) >= 3;
  const weaker =
    c.avg_ret_5d != null && baselineRet != null && c.avg_ret_5d < baselineRet;

  return (
    <div className="border-t border-border-soft pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[14px] text-text-dim">{c.condition}</span>
        <span className="text-[11px] text-text-mute">과거 {c.n}회</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-7 gap-y-2">
        <div>
          <div className="text-[11px] text-text-mute">{forDayLabel} 상승</div>
          <div
            className={`text-[24px] leading-[1.2] tracking-[-0.02em] tnum ${
              meaningful ? (diff! > 0 ? "text-good" : "text-bad") : "text-text"
            }`}
          >
            {pct(up)}
          </div>
        </div>
        <div className="pb-0.5">
          <div className="text-[11px] text-text-mute">조건 없이 세면</div>
          <div className="text-[19px] leading-[1.2] tracking-[-0.02em] tnum text-text-mute">
            {pct(baselineUp)}
          </div>
        </div>
        <span className="mb-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] text-text-dim">
          {meaningful
            ? `${Math.abs(diff!).toFixed(0)}%p ${diff! > 0 ? "높음" : "낮음"}`
            : "차이 없음"}
        </span>
      </div>

      {weaker && (
        <p className="mt-3 text-[12px] leading-relaxed text-text-mute">
          5일 뒤 수익률은 평균보다 낮았습니다 — 방향은 이어졌지만 폭은 줄었습니다.
        </p>
      )}
    </div>
  );
}

export function MarketBrief({
  market,
  planDay,
}: {
  market: MarketBreadth | null;
  /** 다음 거래일 ISO(YYYY-MM-DD). 조건부 확률이 가리키는 날 — 픽이 실제 매매되는 날. */
  planDay?: string | null;
}) {
  if (!market) return null;

  const total = market.advancers + market.decliners;
  const upShare = total > 0 ? market.advancers / total : 0.5;
  const base = market.baseline ?? null;
  // 다음 거래일을 모르면 '다음날'로 물러선다 — 틀린 날짜보다 낫다.
  const forDayLabel = planDay ? monthDay(planDay) : "다음날";

  return (
    <section aria-labelledby="market-brief-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="market-brief-h"
          className="text-[17px] font-medium tracking-[-0.01em] text-text"
        >
          {monthDay(market.as_of)} 장 마감
        </h2>
        {/* 날짜를 모르면 날짜만 뺀다 — '다음 거래일 플랜의 전제'라는 성격은 유지해야
            "오늘 예측"으로 오해되지 않는다. (공휴일 표가 비어 있어 8/15 같은 주말
            공휴일 다음엔 대체공휴일 여부를 단정 못 한다 — nextTradingDayIsCertain) */}
        <span className="text-[12px] text-text-mute">
          다음 거래일{" "}
          {planDay && (
            <span className="text-text-dim">{tradingDayLabel(planDay)}</span>
          )}{" "}
          플랜의 전제
        </span>
      </div>

      {/* 끝난 장의 기록 — 문장으로 늘어놓지 않고 눈금으로 */}
      <div className="mt-5 flex flex-wrap items-end gap-x-9 gap-y-4">
        <Stat
          label="전 종목 평균"
          value={`${market.market_ret >= 0 ? "+" : ""}${(market.market_ret * 100).toFixed(2)}%`}
          tone={market.market_ret >= 0 ? "good" : "bad"}
        />
        <Stat label="오른 종목" value={market.advancers.toLocaleString()} />
        <Stat
          label="내린 종목"
          value={market.decliners.toLocaleString()}
          tone="dim"
        />
      </div>

      {/* 폭 — 3px. 화면에서 제일 튀는 게 막대일 이유가 없다. */}
      <div className="mt-5">
        <div
          className="flex h-[3px] overflow-hidden rounded-full bg-border"
          role="img"
          aria-label={`오른 종목 ${market.advancers}개, 내린 종목 ${market.decliners}개`}
        >
          <div className="bg-good" style={{ width: `${(upShare * 100).toFixed(1)}%` }} />
          <div className="bg-bad" style={{ width: `${((1 - upShare) * 100).toFixed(1)}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-text-mute">
          오른 종목 비율 {pct(upShare)}
          {market.prev_breadth != null && (
            <>
              <span className="mx-1.5 opacity-40">·</span>전일{" "}
              {pct(market.prev_breadth)}
            </>
          )}
        </div>
      </div>

      {/* 앞을 보는 유일한 부분 — 선으로 분리한다 */}
      <div className="mt-6 border-t border-border pt-5">
        <p className="text-[11px] tracking-[0.03em] text-text-mute">
          지금과 같았던 과거는 그다음 어떻게 됐나
          <span className="ml-1.5 opacity-70">
            (최근 {market.lookback_days.toLocaleString()}거래일)
          </span>
        </p>

        <div className="mt-4 space-y-4">
          {market.conditions.length > 0 ? (
            market.conditions.map((c) => (
              <ConditionBlock
                key={c.condition}
                c={c}
                baselineUp={base?.up_rate_1d ?? null}
                baselineRet={base?.avg_ret_5d ?? null}
                forDayLabel={forDayLabel}
              />
            ))
          ) : (
            <p className="text-[13px] text-text-dim">
              오늘은 과거 빈도를 말할 만한 특이 조건이 없습니다.
            </p>
          )}
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-text-mute opacity-75">
          과거 빈도이지 전망이 아닙니다
          <span className="mx-1.5 opacity-50">·</span>
          표본 30회 미만은 표시하지 않습니다
        </p>
      </div>
    </section>
  );
}
