import Link from "next/link";

import { GNB } from "@/components/GNB";
import { HomeHero } from "@/components/HomeHero";
import { createClient } from "@/lib/supabase/server";
import {
  getMarketQuotes,
  getMarketState,
  getMorningBrief,
  getNextTradingDay,
  getOpenPicks,
  getRecommendations,
  getWeeklyReports,
} from "@/lib/data";
import {
  fmtPct,
  nextTradingDayIsCertain,
  nextTradingDayLabel,
  tradingDayLabel,
} from "@/lib/format";
import { horizonLabel } from "@/lib/holding";

/**
 * 홈 — «오늘 무슨 일이 있었나 · 어디로 갈까».
 *
 * 역할을 「오늘의 픽」과 갈랐다(2026-08-22, Victor 확정). 예전 홈은 다른 화면들의
 * 요약본이라 섹션 8개 중 7개가 중복이었고, 첫 화면에 종목이 하나도 없었다.
 * 그래서 여기서는 **상태만** 보여주고 실행 계획은 「오늘의 픽」으로 보낸다.
 *
 *   홈        = 국면 · 오늘 몇 건 · 진행 중 몇 건 · 어디로 갈까   ← 상태판
 *   오늘의 픽 = 선정 과정 · 기간별 진입/손절/본전스톱 · 빈 날 화면 ← 실행 계획
 *
 * 그래서 여기엔 픽을 **상위 3건까지만** 이름·기간·셋업 수준으로 얹는다. 표·필터·
 * 가격 레벨을 넣는 순간 두 화면이 같아진다 — 그게 예전 홈이 실패한 이유다.
 *
 * 시황·최근 보도는 「시장」, 주간 브리핑 본문은 「인사이트」가 갖는다. 여기서는
 * 링크만 건다.
 */

// ── 지수 티커 한 칸 ──
// 지수는 사용자가 물어본 게 아니라 배경 맥락이다. 카드도 배경도 없이 세로 헤어라인
// 하나로만 나눈다. 흐르는 밴드라 셀은 고정폭이어야 한다(flex-1 이면 두 벌의 폭이
// 달라져 이음매가 튄다).
function TickerCell({
  label,
  value,
  unit,
  changePct,
}: {
  label: string;
  value: number;
  unit: string;
  changePct: number | null;
}) {
  const up = (changePct ?? 0) >= 0;
  return (
    <div className="flex w-[190px] shrink-0 items-baseline gap-2 whitespace-nowrap border-r border-border-soft px-4 py-2.5">
      <span className="text-[11px] text-text-mute">{label}</span>
      <span className="tnum text-[14px] font-medium text-text">
        {value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
        {unit && <span className="ml-0.5 text-[11px] text-text-mute">{unit}</span>}
      </span>
      {changePct != null && (
        <span className={`tnum text-[11px] ${up ? "text-good" : "text-bad"}`}>
          {fmtPct(changePct)}
        </span>
      )}
    </div>
  );
}

const STATE_LABEL: Record<string, string> = {
  uptrend: "상승추세",
  downtrend: "하락추세",
  range: "횡보",
};

export default async function HomePage() {
  // 세션 확인 실패는 «비로그인»으로 본다 — 배너 하나 때문에 홈이 죽으면 안 된다.
  let signedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }

  const [quotes, recs, brief, marketState, openPicks, weekly] = await Promise.all([
    getMarketQuotes(),
    getRecommendations(),
    getMorningBrief(),
    getMarketState(),
    getOpenPicks(30),
    getWeeklyReports(2),
  ]);

  const picks = recs.data;
  // 기준일은 «그날 분석»이 기준이다 — 픽의 as_of 를 먼저 보면 픽이 없는 날 하루
  // 전으로 밀려, 홈은 8/21 플랜인데 오늘의 픽은 8/24 플랜이 되는 어긋남이 생긴다.
  const asOf = brief.data?.as_of ?? picks[0]?.as_of ?? null;
  // 1순위는 DB 휴장일 표(market_calendar) — 공휴일까지 반영해 날짜를 확정한다.
  // 표가 그 구간을 아직 못 덮으면 추정(주말만 건너뜀)으로 물러서고, 그것도 미심쩍으면
  // 날짜를 단정하지 않는다. 틀린 날짜보다 «다음 거래일»이 정직하다(오늘의 픽과 동일).
  const nextDay = asOf ? await getNextTradingDay(asOf) : null;
  const planDay = nextDay
    ? tradingDayLabel(nextDay)
    : asOf && nextTradingDayIsCertain(asOf)
      ? nextTradingDayLabel(asOf)
      : null;
  const state = marketState?.market_state ?? null;
  const stateLabel = state ? STATE_LABEL[state] ?? null : null;
  // «오늘» 의 픽만 센다. getRecommendations 는 바스켓별 최신 as_of 행을 주는데,
  // 그 최신이 분석 기준일보다 과거일 수 있다(8/20 발행분 vs 8/21 분석). 그대로 세면
  // 홈은 «5개»인데 오늘의 픽은 «없습니다»가 된다 — 같은 날 두 화면이 다른 말을 한다.
  const todayPicks = asOf ? picks.filter((p) => p.as_of === asOf) : picks;
  const preview = todayPicks.slice(0, 3);
  // 손절까지 3% 이내로 붙은 픽. toStopPct 는 «현재가 → 손절가» 비율이라 롱에서는
  // 음수이고 0 에 가까울수록 코앞이다(-0.03 = 3% 남음). 단위가 %가 아니라 비율이라
  // 처음에 `<= 3` 으로 썼더니 보유 전량이 «손절 근접»으로 잡혔다.
  const nearStop = openPicks.filter(
    (p) => p.toStopPct != null && p.toStopPct >= -0.03,
  ).length;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <GNB />

      {/* 지수 티커 — 읽으려면 멈춰야 하니 hover 시 정지한다. */}
      {quotes.data.length > 0 && (
        <div className="ticker-band no-scrollbar group relative overflow-hidden border-b border-border-soft">
          <div className="flex w-max animate-ticker group-hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              // 두 벌째는 이음매를 메우는 복제본 — 스크린리더가 지수를 두 번 읽지 않게 감춘다.
              <div key={copy} className="flex" aria-hidden={copy === 1}>
                {quotes.data.map((q) => (
                  <TickerCell
                    key={q.id}
                    label={q.label}
                    value={q.value}
                    unit={q.unit}
                    changePct={q.changePct}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-10 pt-7 sm:px-7">
        {!signedIn && <HomeHero />}

        {/* ── 오늘 한 줄 판정 ──
            국면·건수·기준일을 한 줄로. 이게 홈의 본문이다. */}
        <section className="mb-6 rounded-[14px] bg-navy px-5 py-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {stateLabel && (
              <span className="rounded-[999px] bg-on-navy/10 px-3 py-1 text-[12px] font-semibold text-on-navy-2">
                {stateLabel}
              </span>
            )}
            <span className="text-[20px] font-bold text-on-navy">
              {todayPicks.length > 0
                ? `살 만한 종목 ${todayPicks.length}개`
                : "오늘은 살 만한 게 없습니다"}
            </span>
            {planDay && (
              <span className="text-[12px] text-on-navy-3">{planDay} 장 시작 전 플랜</span>
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-on-navy-2">
            {todayPicks.length > 0
              ? "직전 거래일 종가로 분석해 다음 거래일 시가 진입을 전제로 계산했습니다."
              : "기준을 통과한 종목이 없으면 억지로 채우지 않습니다. 쉬는 것도 판단입니다."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/focus"
              className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-navy transition-colors hover:bg-accent-2"
            >
              오늘의 픽 보기
            </Link>
            <Link
              href="/market"
              className="rounded-[9px] border border-on-navy/25 px-4 py-2 text-[13px] font-semibold text-on-navy transition-colors hover:border-on-navy"
            >
              시장 상황
            </Link>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          {/* ── 오늘의 픽 미리보기 (상위 3) ── */}
          <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold text-text">오늘의 픽</h2>
              <Link href="/focus" className="text-[11px] text-accent hover:underline">
                전체 보기 →
              </Link>
            </div>
            {preview.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-text-mute">
                오늘 기준을 통과한 픽이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-border-soft">
                {preview.map((p) => (
                  <li key={p.symbol} className="flex flex-wrap items-baseline gap-x-3 py-2.5">
                    <Link
                      href={`/stocks/${p.symbol}`}
                      className="text-[15px] font-semibold text-text hover:text-accent"
                    >
                      {p.name}
                    </Link>
                    <span className="text-[11px] text-text-mute">{p.symbol}</span>
                    {horizonLabel(p.horizon) && (
                      <span className="rounded-[999px] bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                        {horizonLabel(p.horizon)}
                      </span>
                    )}
                    {p.setup && (
                      <span className="rounded-[999px] bg-surface-3 px-2 py-0.5 text-[11px] text-text-dim">
                        {p.setup}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {todayPicks.length > preview.length && (
              <p className="mt-2 text-[11px] text-text-mute">
                진입가·손절가·비중은 「오늘의 픽」에서 봅니다 · 총 {todayPicks.length}건
              </p>
            )}
          </section>

          {/* ── 우측: 진행 중 · 읽을 것 ── */}
          <div className="flex flex-col gap-5">
            <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-bold text-text">진행 중</h2>
                <Link href="/picks" className="text-[11px] text-accent hover:underline">
                  성과 →
                </Link>
              </div>
              <div className="flex items-baseline gap-5">
                <div>
                  <p className="text-[11px] text-text-mute">보유 중</p>
                  <p className="tnum text-2xl font-bold text-text">{openPicks.length}건</p>
                </div>
                <div>
                  <p className="text-[11px] text-text-mute">손절 근접</p>
                  <p className={`tnum text-2xl font-bold ${nearStop > 0 ? "text-bad" : "text-text-dim"}`}>
                    {nearStop}건
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-bold text-text">읽을 것</h2>
                <Link href="/insights" className="text-[11px] text-accent hover:underline">
                  전체 보기 →
                </Link>
              </div>
              {weekly.length === 0 ? (
                <p className="text-[12px] text-text-mute">아직 쌓인 브리핑이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-border-soft">
                  {weekly.map((w) => (
                    <li key={w.as_of} className="py-2">
                      {/* 주간 브리핑은 개별 상세 라우트가 없다 — 목록은 인사이트가 갖는다. */}
                      <Link
                        href="/insights"
                        className="text-[13px] text-text hover:text-accent"
                      >
                        {w.title}
                      </Link>
                      <p className="text-[11px] text-text-mute">{w.as_of}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
