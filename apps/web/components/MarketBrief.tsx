import type { MarketBreadth, MarketCondition } from "@/lib/data";
import { tradingDayLabel } from "@/lib/format";

// 장 마감 시황 — '오늘 예측'이 아니라 '끝난 장의 기록 + 다음 거래일의 전제'.
//
// 2026-08-16 두 번 다시 만들었다. 실패한 이유를 남긴다:
//  1차 — 제목이 "오늘의 시황"이었다. 16:30 배치가 종가를 분석한 결과인데 앞을 보는
//        것처럼 읽혔다.
//  2차 — 숫자를 눈금 세 개로 늘어놓고, 기준선·표본수·"차이 없음"까지 다 노출했다.
//        Victor: "이게 가독성이 높아보이나? 난 이해가 안된다." 맞는 지적이었다 —
//        **검증 장치를 화면에 늘어놓은 것**이지 읽는 사람을 위한 화면이 아니었다.
//        특히 조건 블록의 결론이 "차이 없음"인데 5줄을 썼다. 의미 없는 얘기를 길게 했다.
//
// 그래서 지금 규칙:
//  · 숫자를 늘어놓지 않고 **문장**으로 말한다.
//  · 기준선과 뚜렷한 차이(MIN_MEANINGFUL_DIFF)가 없으면 **아예 안 보여준다**.
//    대부분의 날은 짧고, 의미 있는 날만 길어진다.
//  · 비율만 말하지 않고 횟수를 함께 — "55번 중 21번"이 "38%"보다 잘 읽힌다.
//  · 조건 라벨은 엔진(breadth.CONDITIONS)에서 이미 완결 문장으로 온다. 전문 용어를
//    라벨에 넣으면 화면으로 새어 나온다("20거래일 누적 +5% 초과"가 그랬다).
//
// 왜 애초에 예측을 안 하나: 합성 지수 442거래일에서 무조건 "오른다"의 적중률이 55.3%다.
// "상승 전망"이라 쓰면 그 55%가 시스템 실력으로 읽힌다.

/** 기준선과 이만큼(%p) 이상 차이나야 화면에 올린다. 그 아래는 표본 노이즈다. */
const MIN_MEANINGFUL_DIFF = 3;

function monthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
}

function meaningful(c: MarketCondition, baselineUp: number | null): boolean {
  if (c.up_rate_1d == null || baselineUp == null) return false;
  return Math.abs((c.up_rate_1d - baselineUp) * 100) >= MIN_MEANINGFUL_DIFF;
}

function Callout({
  c,
  baselineUp,
}: {
  c: MarketCondition;
  baselineUp: number;
}) {
  const up = c.up_rate_1d!;
  const sample = c.sample_1d ?? c.n;
  const count = c.up_count_1d ?? Math.round(up * sample);
  const below = up < baselineUp;

  return (
    <div
      className={`mt-5 rounded-[10px] border p-4 ${
        below ? "border-bad/25 bg-bad-soft" : "border-good/25 bg-good-soft"
      }`}
    >
      <p className="text-[15px] leading-relaxed text-text">
        <span className="font-medium">{c.condition}</span>{" "}
        과거 이런 날이 <span className="font-medium">{sample}번</span> 있었는데,
        그다음 한국 시장이 오른 건{" "}
        <span className="font-medium">
          {count}번({Math.round(up * 100)}%)
        </span>
        {below ? "뿐이었습니다." : "이었습니다."}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-text-mute">
        아무 날이나 세면 10번 중 {Math.round(baselineUp * 10)}번쯤 오릅니다
        <span className="mx-1.5 opacity-50">·</span>
        과거 기록이지 전망이 아닙니다
        {c.avg_ret_5d != null && c.avg_ret_5d < 0 && (
          <>
            <span className="mx-1.5 opacity-50">·</span>
            닷새 뒤까지 보면 평균은 마이너스였습니다
          </>
        )}
      </p>
    </div>
  );
}

export function MarketBrief({
  market,
  planDay,
}: {
  market: MarketBreadth | null;
  /** 다음 거래일 ISO. 공휴일 표가 못 미치면 null — 그때는 날짜만 뺀다. */
  planDay?: string | null;
}) {
  if (!market) return null;

  const total = market.advancers + market.decliners;
  const upShare = total > 0 ? market.advancers / total : 0.5;
  const baselineUp = market.baseline?.up_rate_1d ?? null;
  const upDay = market.advancers >= market.decliners;

  // 뚜렷한 것만. 없으면 조건 블록 자체가 사라진다.
  const shown = (market.conditions ?? []).filter((c) =>
    meaningful(c, baselineUp),
  );

  // 어제와 방향이 뒤집혔나 — "하루 전엔 반대였습니다" 한 줄로만 쓴다.
  const flipped =
    market.prev_breadth != null &&
    market.prev_breadth >= 0.5 !== market.breadth >= 0.5;

  return (
    <section aria-labelledby="market-brief-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="market-brief-h"
          className="text-[16px] font-semibold tracking-[-0.01em] text-text"
        >
          {monthDay(market.as_of)} 장 마감
        </h2>
        {/* 날짜를 모르면 날짜만 뺀다 — 성격까지 지우면 "오늘 예측"으로 다시 읽힌다. */}
        <span className="text-[12px] text-text-mute">
          다음 거래일{" "}
          {planDay && (
            <span className="text-text-dim">{tradingDayLabel(planDay)}</span>
          )}{" "}
          플랜의 전제
        </span>
      </div>

      <p className="mt-4 text-[19px] leading-[1.5] tracking-[-0.01em] text-text">
        오른 종목이{" "}
        <span className={upDay ? "text-good" : ""}>
          {market.advancers.toLocaleString()}개
        </span>
        , 내린 종목이{" "}
        <span className={upDay ? "" : "text-bad"}>
          {market.decliners.toLocaleString()}개
        </span>
        였습니다.
      </p>

      <div
        className="mt-4 flex h-[3px] overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`오른 종목 ${market.advancers}개, 내린 종목 ${market.decliners}개`}
      >
        <div className="bg-good" style={{ width: `${(upShare * 100).toFixed(1)}%` }} />
        <div className="bg-bad" style={{ width: `${((1 - upShare) * 100).toFixed(1)}%` }} />
      </div>

      <p className="mt-2.5 text-[13px] text-text-dim">
        전 종목 평균 {market.market_ret >= 0 ? "+" : ""}
        {(market.market_ret * 100).toFixed(2)}%
        {flipped && (
          <>
            <span className="mx-2 opacity-35">·</span>하루 전엔 반대였습니다
          </>
        )}
      </p>

      {shown.map((c) => (
        <Callout key={c.condition} c={c} baselineUp={baselineUp!} />
      ))}
    </section>
  );
}
