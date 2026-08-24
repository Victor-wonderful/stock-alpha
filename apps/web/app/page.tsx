import Link from "next/link";
import { MarketTicker } from "@/components/MarketTicker";

import { DEFAULT_RISK_PER_TRADE_PCT } from "@/lib/position";
import { GNB } from "@/components/GNB";
import { AuthMenu } from "@/components/AuthMenu";
import { HomeHero } from "@/components/HomeHero";
import { OpenPicksTable } from "@/components/OpenPicksTable";
import { OpenPicksSummary } from "@/components/OpenPicksSummary";
import { HomePicksTable } from "@/components/HomePicksTable";
import { RecentReports, WeeklyBriefs } from "@/components/HomeSections";
import { ExpertNotes } from "@/components/ExpertNotes";
import { HomeTopNews } from "@/components/HomeTopNews";
import {
  getBlogPosts,
  getLatestPricesBySymbols,
  getMarketQuotes,
  getMarketState,
  getMorningBrief,
  getNewsEvents,
  getNextTradingDay,
  getNthTradingDay,
  getTradingCalendar,
  getOpenPicks,
  getRecommendations,
  getExpertNotes,
  getLatestReportDay,
  getReports,
  getTopNews,
  getWeeklyReports,
  pickBlogPosts,
  pickBlogPostsWithEngine,
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
 *   홈        = 오늘 살 것을 «끝까지» (상위 3건, 레벨·비중·청산 기한까지)
 *   오늘의 픽 = 전 기간 · 선정 과정 · 대기 목록 · 시장 브리프 등 «전부와 그 근거»
 *
 * ⚠️ 2026-08-22 에 이 경계를 옮겼다. 원래는 «홈=상태판 / 픽=실행 계획»이었는데, 픽이
 * 하루 0~1건인 지금 그렇게 가르면 홈이 «오리온이 있다»만 말하고 끝나 반이 빈다.
 * 그래도 «전부»는 오늘의 픽이 갖는다 — 홈은 3건까지다(PICKS_MAX=5).
 *
 * 시황·최근 보도는 「시장」, 주간 브리핑 본문은 「인사이트」가 갖는다. 여기서는
 * 링크만 건다.
 */

// ── 지수 티커 한 칸 ──
// 지수는 사용자가 물어본 게 아니라 배경 맥락이다. 카드도 배경도 없이 세로 헤어라인
// 하나로만 나눈다. 흐르는 밴드라 셀은 고정폭이어야 한다(flex-1 이면 두 벌의 폭이
// 달라져 이음매가 튄다).
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
  const [
    quotes, recs, brief, marketState, openPicks, weekly, blogPosts, reports, cal, topNews,
    expertNotes, basisDay,
  ] = await Promise.all([
      getMarketQuotes(),
      getRecommendations(),
      getMorningBrief(),
      getMarketState(),
      getOpenPicks(30),
      getWeeklyReports(3),
      // ── 아래 셋은 «읽을 것» 섹션용 (2026-08-22 Victor 요청으로 복원) ──
      // 홈이 인사이트·종목의 요약본이 되지 않게 각 3건씩만 얹고 「전체 보기」로 보낸다.
      // 예전 홈이 실패한 이유가 «섹션 8개 중 7개가 중복»이었는데, 그건 건수가 아니라
      // «같은 깊이로 두 번 보여준» 탓이었다.
      getBlogPosts(),
      getReports(3),
      // 오늘 주요 뉴스 — 매크로 자리를 대신한다. 종목당 한 줄로 접고 «많이 다뤄진 순».
      // 거래일 계산기 — 휴장일을 한 번만 읽고 메모리에서 센다. 보유 픽마다
      // getNthTradingDay 를 부르면 픽 10건에 왕복 20회다.
      getTradingCalendar(),
      getTopNews(6),
      // 전문가 추천 — 사람이 고른 종목. 엔진이 건드리지 않는 콘텐츠라 조회만 한다.
      getExpertNotes(4),
      // 분석 기준일 — 홈이 «오늘»을 정하는 값. 왜 리포트 날짜인지는 lib/data 주석 참조.
      getLatestReportDay(),
    ]);

  // 전문가 카드의 「진입가 대비」에 쓸 현재가 — 위 묶음이 끝난 뒤에야 종목을 알 수 있다.
  const expertPrices = await getLatestPricesBySymbols(
    expertNotes.notes.map((n) => n.symbol).filter((x): x is string => !!x),
  );

  const picks = recs.data;
  // 기준일은 «그날 분석»이 기준이다 — 픽의 as_of 를 먼저 보면 픽이 없는 날 하루
  // 전으로 밀려, 홈은 8/21 플랜인데 오늘의 픽은 8/24 플랜이 되는 어긋남이 생긴다.
  //
  // 그렇다고 모닝 브리프의 as_of 를 쓰면 안 된다(2026-08-24 사고). 모닝 배치는 평일
  // 08:30 에 «오늘 날짜»로 브리프를 찍는데, 그 시각엔 그날 봉도 그날 픽도 없다 —
  // 그러면 여기서 오늘 픽이 0 건으로 걸러져 「오늘의 픽」 화면과 홈이 서로 다른 말을
  // 한다(그 화면은 리포트 날짜를 쓴다). 실제로 8/21 오리온 1건이 홈에서만 사라졌고,
  // 그 자리를 메우려고 만든 «시가 진입 예정 N건» 안내까지 같이 죽었다(pendingCount 가
  // todayPicks 에서 나온다). 두 화면이 같은 소스를 보게 리포트 날짜를 1순위로 둔다.
  const asOf = basisDay ?? picks[0]?.as_of ?? brief.data?.as_of ?? null;
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
  // 보유 픽의 청산 예정일 — 발행일 다음 거래일이 진입일(1거래일째)이므로 발행일에서
  // 기간(bars)만큼 세면 마지막 날이다. 달력을 이미 읽어 뒀으니 조회는 안 는다.
  const openExitDays = new Map<string, string | null>(
    openPicks.map((p) => {
      const bars = horizonSpec(p.horizon)?.bars;
      const iso = bars ? cal.nth(p.asOf, bars) : null;
      return [p.symbol, iso ? tradingDayLabel(iso) : null];
    }),
  );
  // 블로그 글이 있으면 그걸 쓰고, 없으면 엔진 산출물이 그 자리를 지킨다(컴포넌트가 판단).
  // 사람 글이 먼저, 그 아래 엔진 글 — 인사이트와 같은 규칙이다(2026-08-24).
  const weeklyPosts = pickBlogPostsWithEngine(blogPosts, "view", "weekly", "weekly", 3);
  const analysisPosts = pickBlogPostsWithEngine(
    blogPosts, "stocks", "analysis", "analysis", 3,
  );

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <GNB authSlot={<AuthMenu />} />

      {/* 지수 티커 — components/MarketTicker 로 옮겼다(2026-08-23). 시장 페이지의
          매크로도 같은 모양을 쓰므로 두 곳이 갈라지지 않게 한 컴포넌트로 둔다. */}
      <MarketTicker
        items={quotes.data.map((q) => ({
          id: `${q.id}`,
          label: q.label,
          value: q.value,
          unit: q.unit,
          change: q.changePct,
          isPct: true,
        }))}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-10 pt-7 sm:px-7">
        <HomeHero />

        {/* ── 밴드 1 · 오늘 ──
            좌우 폭을 뒤집어 리듬을 만든다(2026-08-22 Victor). 전폭 블록을 일곱 번
            쌓으면 같은 리듬이 반복돼 «전부 아래로 내려가는» 화면이 된다.
              밴드 1 [1fr | 2fr]  좌 = 오늘 상태(짧은 글·숫자) · 우 = 오늘의 픽(표)
              밴드 2 [2fr | 1fr]  좌 = 읽을 것(글)          · 우 = 매크로(지표)
            비율이 뒤집히면서 화면 가운데에 계단이 생긴다 — 그게 스크롤의 눈금이 된다.
            폭 배정 기준은 내용이다: 표는 넓어야 하고 지표는 좁아도 된다. */}
        <div className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(280px,1fr)_2.6fr]">
          <div className="flex min-w-0 flex-col gap-5">
            {/* ── 오늘 한 줄 판정 ──
                국면·건수·기준일을 한 줄로. 이게 홈의 본문이다. */}
            <section className="rounded-[14px] bg-navy px-5 py-5">
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
              {/* ── 오늘 시장 한 줄 ──
                  예전엔 이 아래에 「오늘 시장은」·「진행 중」이 흰 카드 두 장으로 따로
                  서 있었고(조각처럼 보였다), 합친 뒤에는 「보유」·「대기」 줄이 여기 있었다.
                  둘 다 걷어냈다(2026-08-22 Victor — "대기는 필요 없고") — 「진행 중」이
                  독립 섹션이 되면서 그 헤더가 이미 «이미 산 픽 N건»을 말한다.
                  같은 사실을 두 번 말하지 않는다. 네이비 위라 시세 적/청은 밝은
                  변형(up/down-on-navy)을 쓴다. */}
              <dl className="mt-4 border-y border-on-navy/10">
                {brief.data?.market && (
                  <div className="flex items-baseline gap-3 py-2.5">
                    <dt className="w-[52px] shrink-0 text-[12px] text-on-navy-3">시장</dt>
                    <dd className="min-w-0 flex-1 text-[13px] text-on-navy-2">
                      오른 종목{" "}
                      <span className="tnum font-bold text-up-on-navy">
                        {brief.data.market.advancers.toLocaleString("ko-KR")}
                      </span>{" "}
                      · 내린 종목{" "}
                      <span className="tnum font-bold text-down-on-navy">
                        {brief.data.market.decliners.toLocaleString("ko-KR")}
                      </span>
                    </dd>
                    <Link
                      href="/market"
                      className="shrink-0 text-[11px] text-on-navy-3 transition-colors hover:text-on-navy"
                    >
                      시장 →
                    </Link>
                  </div>
                )}
              </dl>
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
          </div>

          {/* ── 오늘의 픽 — 밴드 1 우측 ──
              「진행 중」과 같은 «항목 헤더 표»다(2026-08-22 Victor — "오늘의 픽도 이와
              같은 유형으로"). 둘은 같은 것을 다른 시점에서 보는 화면이라 모양이 같아야
              한다: 오늘의 픽 = 사기 전 계획, 진행 중 = 산 뒤 상태. */}
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-bold text-text">
                오늘의 픽{" "}
                <span className="text-[11px] font-medium text-text-mute">
                  {todayPicks.length > 0 ? `${todayPicks.length}건 · 점수순` : "발행 없음"}
                </span>
              </h2>
              <Link href="/focus" className="text-[11px] text-accent hover:underline">
                전체 보기 →
              </Link>
            </div>
            <HomePicksTable
              picks={preview}
              prices={previewPrices}
              news={previewNews}
              planDay={planDay}
              exitDays={exitDays}
              riskPct={DEFAULT_RISK_PER_TRADE_PCT}
            />
            {todayPicks.length > preview.length && (
              <p className="mt-2 text-[11px] text-text-mute">
                나머지 {todayPicks.length - preview.length}건은 「오늘의 픽」에서 봅니다 · 총{" "}
                {todayPicks.length}건
              </p>
            )}
          </section>
        </div>

        {/* ── 밴드 2 · 진행 중 ──
            보유가 있으면 밴드 1 과 같은 짝이 된다 — 좌 = 전체가 어떤가(요약),
            우 = 종목별로 어떤가(카드). 카드 모양은 「오늘의 픽」과 같다(Victor 요청):
              오늘의 픽 = «앞으로 어떻게 할 것인가» (비중 · 1주당 리스크)
              진행 중   = «지금 어디까지 왔나»     (수익률 · 보유일수 · 남은 거리)

            ⚠️ 0 건이어도 좌우를 유지한다. 처음엔 갈랐더니 좌측 요약과 우측 빈 상자가
            «1건이 8/24 시가에 들어옵니다»를 나란히 두 번 말해서 한 번 합쳤는데
            (2026-08-22 Victor — "표시가 하나도 없다"), 답은 «합치기»가 아니라
            «다른 말 하기»였다 — 좌는 보유 전체를, 우는 종목별을 말한다.
            섹션 자체도 남는다 — 보유가 생기는 날 구조가 통째로 바뀌면 매일 오는
            사람이 «어제 보던 그 자리»를 잃는다.
            같은 밴드를 /focus 도 쓴다(2026-08-23) — 두 화면이 같은 모양이어야 한다. */}
        <section className="mt-12">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-text">
              진행 중{" "}
              <span className="text-[11px] font-medium text-text-mute">
                {openPicks.length > 0
                  ? `이미 산 픽 ${openPicks.length}건 · 손절 가까운 순`
                  : "이미 산 픽"}
              </span>
            </h2>
            <Link href="/picks" className="text-[11px] text-accent hover:underline">
              전체 기록 →
            </Link>
          </div>

          {/* 0 건이어도 좌우를 유지한다(2026-08-22 Victor). 처음엔 갈랐다가 좌우가
              «1건이 8/24 시가에 들어옵니다»를 두 번 말해 합쳤는데, 답은 «합치기»가
              아니라 «다른 말 하기»였다 — 좌는 보유 전체를, 우는 종목별을 말한다. */}
          {/* 표가 8열이라 밴드 1(1fr_2fr)보다 우측을 조금 더 준다 — 760px 이 최소폭이고
              그 아래로는 가로 스크롤이 생긴다. */}
          <div className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(280px,1fr)_2.6fr]">
            <OpenPicksSummary picks={openPicks} />
            <OpenPicksTable
              picks={openPicks}
              exitDays={openExitDays}
              pendingCount={pendingCount}
              planDay={planDay}
            />
          </div>
        </section>

        {/* ── 밴드 2.5 · 전문가 추천 ──
            엔진 픽 아래, 진행 중 위. «오늘 뭘 사나»의 두 번째 대답이라 그 옆에 두되
            모양을 표가 아니라 카드로 갈랐다 — 진입가·손절가가 없는 것을 표로 그리면
            사용자가 «이것도 검증된 것»으로 읽는다(2026-08-23 Victor: 추적하지 않는다).
            글이 하나도 없으면 섹션이 스스로 «아직 없습니다»를 말한다 — 자리를 지워
            버리면 첫 글이 올라온 날 화면 구조가 통째로 바뀐다. */}
        <div className="mt-12">
          <ExpertNotes
            notes={expertNotes.notes}
            prices={expertPrices}
            failed={expertNotes.failed}
          />
        </div>

        {/* ── 밴드 3 · 읽을 것 ──
            우측 사이드바 배치를 걷어냈다(2026-08-23 Victor — "섹션 배치를 우측에
            저렇게 하지 마라"). 좁은 칸(1fr ≈ 400px)에 목록을 넣으면 제목이 잘리고,
            sticky 까지 걸면 스크롤 중에 계속 따라와 읽는 흐름을 방해한다.
            **균등 2열**이라 양쪽 다 목록이 온전히 들어간다.

            매크로는 홈에서 뺐다 — FRED 시리즈라 발표가 3~4일 늦어 «매일 브리핑»이
            되지 못했고, 3줄 중 2줄이 상단 티커와 같은 값이었다. 그 자리를 매 거래일
            들어오는 뉴스가 대신한다. 매크로 자체는 인사이트(/insights)에 남는다. */}
        <div className="mt-12 grid items-start gap-x-8 gap-y-10 lg:grid-cols-2">
          <HomeTopNews items={topNews} />
          <div className="min-w-0 [&>section:first-child]:mt-0">
            <WeeklyBriefs posts={weeklyPosts} reports={weekly} />
            <RecentReports posts={analysisPosts} reports={reports.data} />
          </div>
        </div>
      </main>
    </div>
  );
}
