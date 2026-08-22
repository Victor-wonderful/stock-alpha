import Link from "next/link";

import { DEFAULT_RISK_PER_TRADE_PCT } from "@/lib/position";
import { GNB } from "@/components/GNB";
import { HomeHero } from "@/components/HomeHero";
import { HomePickCard } from "@/components/HomePickCard";
import {
  getLatestPricesBySymbols,
  getMarketQuotes,
  getMarketState,
  getMorningBrief,
  getNewsEvents,
  getNextTradingDay,
  getNthTradingDay,
  getOpenPicks,
  getRecommendations,
  getWeeklyReports,
} from "@/lib/data";
import {
  fmtPct,
  nextTradingDayIsCertain,
  nextTradingDayLabel,
  nthTradingDayLabel,
  tradingDayLabel,
  tradingWindowIsCertain,
} from "@/lib/format";
import { horizonSpec } from "@/lib/holding";

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

// 국면 칩 색 — 오늘 무엇을 할지 정하는 값인데 회색 반투명이라 화면에서 가장 약했다
// (2026-08-22). 시세 관례를 그대로 따른다: 상승=적 · 하락=청 · 횡보=앰버.
// 네이비 위라 라이트 바탕용 --good/--bad/--warn 을 못 쓴다(#C41F33 은 navy 대비 2.4:1).
// 어두운 면용 밝은 변형을 쓴다 — 대비 up 5.6 / down 7.2 / warn 10.4.
const STATE_CHIP: Record<string, string> = {
  uptrend: "bg-up-on-navy/15 text-up-on-navy",
  downtrend: "bg-down-on-navy/15 text-down-on-navy",
  range: "bg-warn-on-navy/15 text-warn-on-navy",
};

export default async function HomePage() {
  // 세션을 보지 않는다. 예전엔 여기서 auth.getUser() 를 불러 «로그인이면 히어로를
  // 숨긴다»를 했는데, 로그인·회원가입으로 가는 길이 UI 에 없다 — GNB 프로필 버튼은
  // title="로그인 준비 중" 인 껍데기이고, /login 을 링크하는 건 아무도 안 쓰는
  // components/Nav.tsx 뿐이다(2026-08-22 확인).
  //
  // 그래서 실제로는 «가입할 수 없는데 숨김 분기만 있는» 상태였고, 그 분기에 걸리는
  // 사람은 옛 세션 쿠키를 가진 Victor 하나였다. 그에게만 히어로가 안 보이고 화면
  // 아래 절반이 비었다. 분기를 지우면 요청 하나(세션 왕복)도 같이 준다.
  //
  // ⚠️ 인증을 제대로 붙일 때 «로그인 사용자에게 히어로를 어떻게 할지»를 다시 정한다.
  //    그때는 홈을 로그인 뒤로 감추지 않는다 — 홈은 공개 화면이다(Victor, 2026-08-22).
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
  // 홈은 «상태판»인데 정작 픽 줄에 시세가 없었다(2026-08-22). 벌크 조회라 픽이 몇
  // 건이든 왕복 1회이고, 픽이 없는 날은 아예 안 부른다.
  const previewPrices =
    preview.length > 0
      ? await getLatestPricesBySymbols(preview.map((p) => p.symbol))
      : null;
  // 픽 종목의 최근 보도 — «왜 샀나»가 아니라 «무슨 일이 있었나»다. 뉴스는 매수 신호가
  // 아니다(PEAD 실측 -0.02). 제목·링크 없이 «같은 날 몇 개 매체가 다뤘나»만 센다.
  // 심볼을 통째로 넘기는 벌크 조회라 픽이 몇 건이든 왕복 2회다.
  const previewNews =
    preview.length > 0
      ? await getNewsEvents(preview.map((p) => p.symbol), { minOutlets: 2, days: 10 })
      : null;

  // 청산 기한 — «진입 후 N거래일이 되면 그날 종가에 전량 정리»가 규칙인데 화면 어디에도
  // 없었다(2026-08-22 Victor 지적). 기간이 정하는 값이라 픽마다 다를 수 있지만 종류는
  // 많아야 셋(단기5·중기10·장기20)이라, 픽 수가 아니라 **기간 수**만큼만 조회한다.
  // 진입일(nextDay)을 모르거나 휴장일 표가 그 구간을 못 덮으면 날짜를 비운다 —
  // 틀린 날짜보다 「10거래일」이 정직하다.
  const exitDays = new Map<number, string | null>();
  {
    const barsList = [
      ...new Set(
        preview
          .map((p) => horizonSpec(p.horizon)?.bars)
          .filter((b): b is number => typeof b === "number"),
      ),
    ];
    const resolved = await Promise.all(
      // 진입일 자체가 1거래일째다 — 10거래일 보유면 진입일 뒤로 9거래일 더 간다.
      barsList.map((b) => (nextDay ? getNthTradingDay(nextDay, b - 1) : null)),
    );
    barsList.forEach((b, i) => {
      // 1순위는 DB 휴장일 표. 그게 그 구간을 못 덮으면(지금이 그렇다 — 시드 파일의
      // holidays 가 비어 있어 holiday-coverage 마커가 없다) 주말만 건너뛴 추정으로
      // 물러선다. 단 그 창에 고정 공휴일이 하나라도 낄 수 있으면 날짜를 비운다 —
      // 「10거래일째」가 틀린 날짜보다 정직하다. 홈의 «다음 거래일» 라벨과 같은 규칙.
      // 세는 기준이 다르면 하루가 어긋난다. 진입일부터 세면 진입일이 1거래일째라
      // b-1 을 더하고, 분석일부터 세면 진입일이 이미 +1 이므로 b 를 더한다.
      const from = nextDay ?? asOf;
      const n = nextDay ? b - 1 : b;
      const fallback =
        from && tradingWindowIsCertain(from, b * 2)
          ? nthTradingDayLabel(from, n)
          : null;
      exitDays.set(b, resolved[i] ? tradingDayLabel(resolved[i]!) : fallback);
    });
  }
  // 손절까지 3% 이내로 붙은 픽. toStopPct 는 «현재가 → 손절가» 비율이라 롱에서는
  // 음수이고 0 에 가까울수록 코앞이다(-0.03 = 3% 남음). 단위가 %가 아니라 비율이라
  // 처음에 `<= 3` 으로 썼더니 보유 전량이 «손절 근접»으로 잡혔다.
  const nearStop = openPicks.filter(
    (p) => p.toStopPct != null && p.toStopPct >= -0.03,
  ).length;
  // 「진행 중」이 status='open' 만 세는 바람에, 오늘 낸 픽이 있는데도 0건이 떴다
  // (2026-08-22 Victor 지적). 새 규칙은 «다음 거래일 시가 진입»이라 발행 당일 픽은
  // 항상 pending 이다 — 아직 안 산 것이지 없는 게 아니다. 그대로 두면 「오늘의 픽」
  // 카드엔 종목이 있는데 옆 카드는 «없습니다»라 두 카드가 서로 모순돼 보인다.
  // todayPicks 가 이미 status 를 들고 있어 조회를 더 하지 않는다.
  const pendingCount = todayPicks.filter((p) => p.status === "pending").length;

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
        <HomeHero />

        {/* ── 오늘 한 줄 판정 ──
            국면·건수·기준일을 한 줄로. 이게 홈의 본문이다. */}
        <section className="mb-6 rounded-[14px] bg-navy px-5 py-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {stateLabel && (
              <span
                className={`rounded-[999px] px-3 py-1 text-[12px] font-semibold ${
                  (state && STATE_CHIP[state]) ?? "bg-on-navy/10 text-on-navy-2"
                }`}
              >
                {stateLabel}
              </span>
            )}
            {/* 홈의 h1 이다. 예전엔 HomeHero 안의 "감이 아니라 근거로"가 유일한 h1 이라
                로그인해서 히어로가 숨겨지면 홈에 제목이 아예 없었다(2026-08-22).
                이 줄은 로그인 여부와 무관하게 항상 있고, 이미 화면에서 제목 노릇을
                하고 있었다 — 마크업을 실제와 맞춘 것이다. */}
            <h1 className="text-[24px] font-bold leading-[1.3] tracking-[-0.5px] text-on-navy">
              {todayPicks.length > 0
                ? `살 만한 종목 ${todayPicks.length}개`
                : "오늘은 살 만한 게 없습니다"}
            </h1>
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

        {/* ── 오늘의 픽 — 전폭 실행 카드 ──
            표가 4열이라 사이드컬럼(1fr)에 넣으면 칸이 뭉개진다. 픽을 본문 폭 전체로
            올리고, 상태 카드(진행 중·읽을 것)를 그 아래로 내렸다. */}
        <section className="mb-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-text">오늘의 픽</h2>
            <Link href="/focus" className="text-[11px] text-accent hover:underline">
              전체 보기 →
            </Link>
          </div>
          {preview.length === 0 ? (
            <p className="rounded-[12px] border border-border bg-surface py-8 text-center text-[13px] text-text-mute">
              오늘 기준을 통과한 픽이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {preview.map((p) => (
                <HomePickCard
                  key={p.symbol}
                  pick={p}
                  price={previewPrices?.get(p.symbol) ?? null}
                  planDay={planDay}
                  exitDay={exitDays.get(horizonSpec(p.horizon)?.bars ?? -1) ?? null}
                  riskPct={DEFAULT_RISK_PER_TRADE_PCT}
                  events={previewNews?.get(p.symbol) ?? []}
                />
              ))}
            </ul>
          )}
          {todayPicks.length > preview.length && (
            <p className="mt-2 text-[11px] text-text-mute">
              나머지 {todayPicks.length - preview.length}건은 「오늘의 픽」에서 봅니다 · 총{" "}
              {todayPicks.length}건
            </p>
          )}
        </section>

        {/* 아래 세 카드는 균등 3열이다. 예전엔 [1.6fr | 1fr] 이라 **넓은 칸(839px)에
            제일 적은 내용**(「오늘 시장은」 한 문장)이 들어가고 좁은 칸(525px)에 카드가
            둘 쌓여, 좌우 높이가 100px vs 253px 로 벌어졌다(2026-08-22 Victor 지적).
            「오늘의 픽」의 빈 여백을 고쳐놓고 같은 실수를 옆 칸에서 반복한 것이다.
            셋 다 «한 문장~두 줄»짜리 상태 카드라 폭을 다르게 줄 이유가 없다. */}
        <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {/* ── 오늘 시장은 ──
              아침 브리핑은 홈이 이미 통째로 조회하는데 날짜 한 줄만 쓰고 버리고 있었다
              (2026-08-22). 시장 메뉴의 요약본을 만들지 않는다 — 그날 폭 한 문장과 링크
              뿐이다. 지표·공시·레짐은 시장이 갖는다. */}
          {brief.data?.market ? (
            <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-bold text-text">오늘 시장은</h2>
                <Link href="/market" className="text-[11px] text-accent hover:underline">
                  시장 →
                </Link>
              </div>
              <p className="text-[14px] leading-relaxed text-text">
                오른 종목{" "}
                <span className="tnum font-bold text-good">
                  {brief.data.market.advancers.toLocaleString("ko-KR")}
                </span>{" "}
                · 내린 종목{" "}
                <span className="tnum font-bold text-bad">
                  {brief.data.market.decliners.toLocaleString("ko-KR")}
                </span>
              </p>
              <p className="mt-1.5 text-[11px] text-text-mute">
                {brief.data.market.as_of} 종가 기준
                {brief.data.market.baseline.up_rate_1d != null && (
                  <>
                    {" · "}보통은 10번 중{" "}
                    {Math.round(brief.data.market.baseline.up_rate_1d * 10)}번쯤 오릅니다
                  </>
                )}
              </p>
            </section>
          ) : (
            <div />
          )}

          {/* ── 진행 중 ── */}
          <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-bold text-text">진행 중</h2>
                <Link href="/picks" className="text-[11px] text-accent hover:underline">
                  성과 →
                </Link>
              </div>
              {/* 숫자 크기는 «중요도»를 뜻하는데 0 은 중요하지 않다. 아무것도 없는 날
                  "0건 0건"을 24px 볼드로 두 번 찍어 시선을 뺏고 있었다(2026-08-22).
                  보유가 없으면 문장 한 줄로 말하고, 한 건이라도 있으면 숫자로 돌아간다. */}
              {openPicks.length === 0 ? (
                <p className="text-[12.5px] leading-relaxed text-text-mute">
                  {pendingCount > 0 ? (
                    <>
                      아직 산 픽이 없습니다.
                      <br />
                      오늘 낸{" "}
                      <span className="font-semibold text-text-dim">{pendingCount}건</span>이{" "}
                      {planDay ?? "다음 거래일"} 시가 진입을 기다립니다.
                    </>
                  ) : (
                    <>
                      보유 중인 픽이 없습니다.
                      <br />
                      손절 근접도 없습니다.
                    </>
                  )}
                </p>
              ) : (
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
                  {/* 보유가 있는 날에도 «오늘 낸 건 아직 안 샀다»를 같이 말해야
                      「오늘의 픽」 카드의 건수와 어긋나지 않는다. */}
                  {pendingCount > 0 && (
                    <div>
                      <p className="text-[11px] text-text-mute">진입 대기</p>
                      <p className="tnum text-2xl font-bold text-text-dim">{pendingCount}건</p>
                    </div>
                  )}
                </div>
              )}
          </section>

          {/* ── 읽을 것 ── */}
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
      </main>
    </div>
  );
}
