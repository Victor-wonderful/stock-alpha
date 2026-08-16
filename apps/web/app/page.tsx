import Link from "next/link";
import { GNB } from "@/components/GNB";
import { MarketBrief } from "@/components/MarketBrief";
import {
  getDashboardKpi,
  getMarketQuotes,
  getRecommendations,
  getReports,
  getBacktests,
  getMorningBrief,
  getLatestPricesBySymbols,
  getNewsEvents,
  getOpenPicks,
  getNextTradingDay,
} from "@/lib/data";
import {
  fmtPrice,
  fmtPct,
  tradingDayLabel,
  nextTradingDayLabel,
  nextTradingDayIsCertain,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { SampleBadge } from "@/components/ui";
import { PriceNow } from "@/components/PriceNow";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

// ── 셋업 키 → 한국어 표기 (검증 현황 카드)

// ── 마켓 스트립 카드
function MarketCard({
  label,
  value,
  unit,
  changePct,
  spark,
  sample,
  asOf,
}: {
  label: string;
  value: number;
  unit: string;
  changePct: number | null;
  spark: number[];
  sample?: boolean;
  asOf?: string;
}) {
  const up = (changePct ?? 0) >= 0;
  const changeColor = up ? "text-good" : "text-bad";
  // 스파크라인 SVG (간단한 폴리라인)
  const min = Math.min(...spark);
  const max = Math.max(...spark);
  const range = max - min || 1;
  const pts = spark
    .map((v, i) => {
      const x = (i / (spark.length - 1)) * 80;
      const y = 20 - ((v - min) / range) * 18;
      return `${x},${y}`;
    })
    .join(" ");

  // 티커 밴드의 한 칸. 배경도 테두리 카드도 없다 — 세로 헤어라인 하나로만 나눈다.
  // 한 줄에 라벨·값·등락을 눕혀 밴드 높이를 36px 로 눌렀다(예전 카드 7장은 첫 화면의 절반).
  return (
    // 흐르는 밴드라 셀은 고정폭이어야 한다(flex-1 이면 두 벌의 폭이 달라져 이음매가 튄다).
    <div className="flex w-[210px] shrink-0 items-baseline gap-2 whitespace-nowrap border-r border-border-soft px-4 py-2.5">
      <span className="text-[11px] text-text-mute">{label}</span>
      <span className="tnum text-[14px] font-medium text-text">
        {value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
        {unit && <span className="ml-0.5 text-[11px] text-text-mute">{unit}</span>}
      </span>
      {changePct != null && (
        <span className={`tnum text-[11px] ${changeColor}`}>{fmtPct(changePct)}</span>
      )}
      {sample && <span className="text-[11px] text-text-mute">예시</span>}
      <svg
        width="40"
        height="12"
        viewBox="0 0 80 20"
        preserveAspectRatio="none"
        className="ml-auto shrink-0 self-center opacity-50"
        aria-hidden
      >
        <polyline
          points={pts}
          fill="none"
          stroke={up ? "var(--good)" : "var(--bad)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

// ── 판정 배지
function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const v =
    rating === "매수"
      ? "bull"
      : rating === "거래 부적합"
        ? "bear"
        : "warn";
  return (
    <Badge variant={v as "bull" | "bear" | "warn"} size="sm">
      {rating}
    </Badge>
  );
}

export default async function DashboardPage() {
  const [kpi, quotes, recs, reports, backtests, brief] = await Promise.all([
    getDashboardKpi(),
    getMarketQuotes(),
    getRecommendations(),
    getReports(150), // 판정 분포 표본 — 일 발행 상한(100) 이상으로 가져와야 분포가 안 잘림
    getBacktests(),
    getMorningBrief(),
  ]);

  // 시장 레짐 — 모닝 브리프(market 리포트) 실데이터. 없으면 필 비표시.
  const regime = brief.data?.regime ?? null;
  // 레짐을 알약 배지가 아니라 헤드라인의 첫 단어로 쓴다. 배지는 화면 구석의
  // 장식이지만, 오늘 시장을 어떻게 볼지가 이 제품의 첫 마디여야 한다.
  const regimeWord =
    regime?.regime === "risk_off"
      ? "방어 구간"
      : regime?.regime === "risk_on"
        ? "공격 구간"
        : "중립 구간";
  const regimeTone =
    regime?.regime === "risk_off"
      ? "text-bad"
      : regime?.regime === "risk_on"
        ? "text-good"
        : "text-warn";

  // 심볼별 최신 판정 — 픽 배지·가드용. reports.data 는 as_of 내림차순이라 첫 등장이 최신.
  const ratingBySymbol = new Map<string | null, string | null>();
  for (const r of reports.data) {
    if (!ratingBySymbol.has(r.symbol)) ratingBySymbol.set(r.symbol, r.rating);
  }
  const latestDay = reports.data[0]?.as_of ?? null;
  const todayReps = reports.data.filter((r) => r.as_of === latestDay);

  // 오늘의 포커스 픽 — 추천(/focus) 페이지와 동일 가드: 최신 리포트 날짜의 픽만 +
  // 최신 판정이 '거래 부적합'인 stale 픽 제외 → 홈 미리보기 = 추천 페이지 일치.
  const picks = (
    recs.isSample
      ? []
      : recs.data.filter((r) => r.basket_type === "daily_focus")
  ).filter(
    (p) =>
      (!latestDay || p.as_of === latestDay) &&
      ratingBySymbol.get(p.symbol) !== "거래 부적합",
  );
  // 분석 기준일 — 픽이 0건인 날에도 날짜를 잃지 않도록 리포트 최신일로 폴백.
  // (픽에서만 뽑으면 빈 날에 헤더가 "장마감 데이터 기준"으로만 떠 날짜가 사라졌다)
  const asOf = picks[0]?.as_of ?? latestDay;
  // 픽은 종가 분석 → 다음 거래일 플랜이다. 대상일을 함께 적어야 오해가 없다.
  // 1순위는 DB 휴장일 표(market_calendar) — 공휴일까지 반영해 날짜를 확정한다.
  // 표가 아직 그 구간을 못 덮으면 기존 추정(주말만 건너뜀 + 고정공휴일 회피)으로 물러서고,
  // 그것도 미심쩍으면 날짜를 단정하지 않는다. 틀린 날짜보다 "다음 거래일"이 정직하다.
  const nextDay = asOf ? await getNextTradingDay(asOf) : null;
  const planDay = nextDay
    ? tradingDayLabel(nextDay)
    : asOf && nextTradingDayIsCertain(asOf)
      ? nextTradingDayLabel(asOf)
      : null;

  // 진행중인 픽 — 어제·그제 추천이 지금 어디쯤 와 있나. 홈에 없던 블록이다.
  const openPicks = await getOpenPicks(30);

  // 현재가·전일대비 — 추천 5건을 벌크 1회로 가져온다(예전엔 종목당 1회, 5왕복).
  // 홈에서 '분석한 종목 전체' 목록을 걷어내며 리포트 심볼 조회도 함께 뺐다.
  const previewPicks = picks.slice(0, 5);
  const priceMap = await getLatestPricesBySymbols(previewPicks.map((p) => p.symbol));
  // 추천 종목에 '사건'이 있었나 — 기사 제목은 쓰지 않고 보도 밀도로만 판단한다.
  const eventMap = await getNewsEvents(previewPicks.map((p) => p.symbol), { minOutlets: 2, days: 10 });

  // 판정 분포 (리포트 기반)
  const dist = {
    매수: todayReps.filter((r) => r.rating === "매수").length,
    중립: todayReps.filter((r) => r.rating === "중립").length,
    관망: todayReps.filter((r) => r.rating === "관망").length,
    total: todayReps.length,
  };

  // KPI 오버라이드 — '오늘의 픽'은 아래 포커스 목록(picks)과 반드시 일치해야 한다.
  // 과거: picks.length || kpi.picksToday → picks 0건(하락장)일 때 0이 falsy 라
  // kpi.picksToday(픽 있던 과거 as_of 건수)로 폴백해 KPI(3) vs 포커스(0)가 어긋났다.
  const kpiDisplay = {
    picksToday: recs.isSample ? kpi.picksToday : picks.length,
    reportsTotal: kpi.reportsTotal || reports.data.length,
    backtestPassed: kpi.backtestPassed,
    backtestTotal: kpi.backtestTotal,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <GNB />

      {/* ── 지수 티커 밴드 ──
          지수는 사용자가 물어본 게 아니라 배경 맥락이다. 콘텐츠 흐름에서 빼
          GNB 아래 얇은 밴드로 내린다(터미널의 티커 자리). 카드도 배경도 없다.
          좁은 화면에선 7종이 다 안 들어가므로 흐르게 둔다 — 가로 스크롤은
          "옆에 뭔가 더 있다"를 사용자가 알아채야 하지만 티커는 저절로 보여준다.
          읽으려면 멈춰야 하니 hover 시 정지한다. */}
      <div className="ticker-band no-scrollbar group relative overflow-hidden border-b border-border-soft">
        <div className="flex w-max animate-ticker group-hover:[animation-play-state:paused]">
          {[0, 1].map((copy) => (
            // 두 벌째는 이음매를 메우는 복제본 — 스크린리더가 지수를 두 번 읽지 않도록 감춘다.
            <div key={copy} className="flex" aria-hidden={copy === 1}>
              {quotes.data.map((q) => (
                <MarketCard
                  key={q.id}
                  label={q.label}
                  value={q.value}
                  unit={q.unit}
                  changePct={q.changePct}
                  spark={q.spark}
                  sample={q.sample}
                  asOf={q.asOf}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 pb-10 pt-9">
        {/* ── 오늘의 판단 ──
            예전엔 "홈" 이라는 제목과 KPI 상자 4개로 시작했다. 제목은 정보가 0이고
            KPI 는 자기자랑("리포트 100건 발행")이라 정작 상품인 픽이 세 번째로 밀렸다.
            화면은 이 제품이 파는 것 — 오늘의 판단 — 으로 연다. */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.06em] text-text-mute">
              {planDay ? `${planDay} 장 시작 전 기준` : "다음 거래일 장 시작 전 기준"}
              {quotes.isSample && <SampleBadge />}
            </p>
            <h1 className="mt-2 text-[34px] font-bold leading-[1.15] tracking-[-0.02em] text-text">
              {regime ? (
                <>
                  <span className={regimeTone}>{regimeWord}</span>
                  <span className="text-text-dim">, </span>
                  {picks.length}종목
                </>
              ) : (
                <>{picks.length}종목</>
              )}
            </h1>
            <p className="mt-2 text-[14px] text-text-dim">
              {/* 분석 시점을 못 박는다. '오늘'로 뭉뚱그리면 토요일에 보는 사람에게
                  금요일 장마감 산출물이 오늘 것처럼 읽힌다. */}
              {asOf ? `${asOf} 장마감(16:30) 분석` : "장마감 분석"}
              <span className="mx-2 text-border-strong">│</span>
              기준을 통과한 종목만 추천에 오릅니다
            </p>
          </div>

          <Link
            href="/focus"
            className="whitespace-nowrap rounded-[12px] bg-accent px-5 py-2.5 text-[14px] font-semibold text-[#0B0C10] transition-colors hover:bg-accent-2"
          >
            추천 종목 전체 보기
          </Link>
        </div>

        {/* 보조 지표 한 줄 띠(발행 리포트 건수·검증 통과 전략)는 맨 아래로 내렸다.
            "리포트 100건 발행"은 우리가 한 일이지 사용자가 얻는 것이 아니다 —
            첫 화면에서 자랑을 하면 정작 상품인 추천이 뒤로 밀린다. */}

        {/* ── 본문 ──
            예전엔 좌(픽·리포트) / 우(메타 3종) 2컬럼이었다. 두 컬럼의 콘텐츠 길이가
            달라 섹션 구분선이 서로 어긋났고(좌 722px 에서 1회, 우 464·733px 에서 2회),
            가로줄 두 세트가 따로 노는 게 "높이가 안 맞는다"로 읽혔다.
            컬럼을 없애면 어긋날 짝이 사라진다 — 픽·리포트는 전체 폭으로 세우고,
            보조 지표 3종은 맨 아래 한 줄 띠로 내린다(세로 헤어라인으로만 분할). */}
        {/* ── 오늘의 시황 ──
            2단 그리드 위 전체 폭. 좌(추천)·우(참고) 어느 한쪽에 넣으면 그 컬럼의
            부속처럼 읽히는데, 시장 맥락은 양쪽 모두의 전제다.
            내용은 '전망'이 아니라 '오늘 무슨 일이 있었나 + 과거 같은 상황의 빈도'다 —
            442거래일 측정에서 무조건 "오른다"의 적중률이 55.3%였다. 전망을 쓰면
            그 55%가 시스템 실력으로 읽힌다(components/MarketBrief 주석). */}
        {brief.data?.market && (
          <section className="mb-6 rounded-[12px] border border-border-soft bg-surface/40 p-5">
            <MarketBrief market={brief.data.market} planDay={nextDay} />
          </section>
        )}

        {/* ── 본문 2단 ──
            세로로만 쌓으니 "아래로 쭉 연결된" 하나의 긴 목록으로 읽혔다. 왼쪽은
            돈이 걸린 것(추천·보유), 오른쪽은 참고 정보(보도·요약)로 나눈다.
            items-start — 높이가 다른 블록이 억지로 늘어나지 않게. */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* 장전 플랜 — 카드 상자를 걷고 표로 세운다.
                밀도 8 짜리 데이터에 카드 컨테이너를 씌우면 정보가 상자 안에 갇혀
                옆 패널과 같은 무게로 읽힌다. 여기선 헤어라인과 여백만 쓴다. */}
            <section className="rounded-[12px] border border-border-soft bg-surface/40 p-5">
              <div className="flex items-baseline justify-between pb-3">
                {/* "오늘의 포커스"였다. 오늘(8/15)과 무관하게 8/14 종가로 만든
                    8/17 플랜이라 '오늘'은 틀린 말이었고, 아래 '최신 분석 리포트'와
                    나란히 놓이면 둘이 다른 시점처럼 읽혔다. */}
                {/* 제목은 시스템이 한 일(매매 계획/판정)이 아니라 사용자가 묻는 것에
                    답해야 한다 — "그래서 뭘 사면 되는데?" */}
                <h2 className="flex items-baseline gap-2 text-sm font-bold text-text">
                  추천 종목
                  <span className="text-[11px] font-medium text-text-mute">
                    {picks.length}종목 · 진입가·목표가·손절가까지 계산 완료
                  </span>
                </h2>
              </div>
              {/* 컬럼 헤더 — 어느 숫자가 무엇인지 표가 스스로 말하게 한다.
                  예전엔 진입가·목표가·R:R 이 라벨 없이 우측에 뭉쳐 있었다. */}
              {picks.length > 0 && (
                <div className="no-scrollbar overflow-x-auto border-b border-border-soft">
                  <div className="grid grid-cols-[minmax(110px,1.3fr)_3.5rem_minmax(96px,1fr)_minmax(88px,1fr)_minmax(100px,1.1fr)_minmax(100px,1.1fr)_3.5rem] items-center gap-2.5 min-w-[700px] px-1 pb-2 text-[11px] tracking-[0.04em] text-text-mute">
                    <span>종목</span>
                    <span>판정</span>
                    <span className="text-right">현재가</span>
                    <span className="text-right">진입가</span>
                    <span className="text-right">목표가</span>
                    <span className="text-right">손절가</span>
                    <span className="text-right">손익비</span>
                  </div>
                </div>
              )}
              <div className="no-scrollbar divide-y divide-border-soft overflow-x-auto">
                {picks.length === 0 ? (
                  <div className="px-1 py-8 text-center text-sm text-text-mute">
                    {recs.isSample
                      ? "데이터 연결 후 픽이 표시됩니다"
                      : `${planDay ? `${planDay} 장전 — ` : ""}기준을 통과한 종목이 없습니다`}
                  </div>
                ) : (
                  previewPicks.map((p) => (
                    // 한 행에 이름·스타일·판정·현재가·계획가·R:R·점수가 들어간다.
                    // 좁은 화면에서 잘려나가지 않도록 이 코드베이스의 표 관례대로
                    // min-w 를 주고 가로 스크롤에 맡긴다(정보를 숨기지 않는다).
                    <div
                      key={p.symbol}
                      className="grid grid-cols-[minmax(110px,1.3fr)_3.5rem_minmax(96px,1fr)_minmax(88px,1fr)_minmax(100px,1.1fr)_minmax(100px,1.1fr)_3.5rem] items-center gap-2.5 min-w-[700px] px-1 py-3.5 transition-colors hover:bg-surface"
                    >
                      <div className="flex min-w-0 items-baseline gap-2">
                        <Link
                          href={`/stocks/${p.symbol}`}
                          className="truncate text-[16px] font-semibold text-text hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        <span className="mono shrink-0 text-[11px] text-text-mute">{p.symbol}</span>
                      </div>
                      <span>
                        <RatingBadge rating={ratingBySymbol.get(p.symbol) ?? null} />
                      </span>
                      {/* 현재가·전일대비 — 계획가(진입→목표)와 나란히 두어 지금 위치를 읽게 한다. */}
                      <span className="text-right">
                        <PriceNow
                          close={priceMap.get(p.symbol)?.close}
                          changePct={priceMap.get(p.symbol)?.changePct}
                          date={priceMap.get(p.symbol)?.date}
                          size="xs"
                          label={null}
                        />
                      </span>
                      {/* 진입·목표·손절을 각각 세운다. 예전엔 "진입 → 목표"만 붙여 놓고
                          손절가가 아예 없었다. 손절은 손실 크기를 정하는 값이라
                          가장 먼저 보여야 하는 숫자다(2026-08-14 NHN 은 손절이 -47.4% 였는데
                          화면에 없어서 드러나지 않았다). 진입가 대비 %를 함께 적어
                          거리가 눈에 들어오게 한다. */}
                      <span className="tnum text-right text-[14px] text-text-dim">
                        {fmtPrice(p.entry_price)}
                      </span>
                      <span className="tnum text-right text-[14px]">
                        <span className="text-good">{fmtPrice(p.target_price)}</span>
                        {p.entry_price && p.target_price && (
                          <span className="block text-[11px] text-good">
                            {fmtPct((p.target_price - p.entry_price) / p.entry_price)}
                          </span>
                        )}
                      </span>
                      <span className="tnum text-right text-[14px]">
                        <span className="text-bad">{fmtPrice(p.stop_loss)}</span>
                        {p.entry_price && p.stop_loss && (
                          <span className="block text-[11px] text-bad">
                            {fmtPct((p.stop_loss - p.entry_price) / p.entry_price)}
                          </span>
                        )}
                      </span>
                      <span className="tnum text-right text-[11px] text-text-dim">
                        {p.entry_price && p.stop_loss && p.target_price
                          ? `${((p.target_price - p.entry_price) / (p.entry_price - p.stop_loss)).toFixed(1)}`
                          : "—"}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {/* ── 진행중인 픽 ──
                  홈에 없던 블록이다. 추천 목록만 있고, 그 추천들이 지금 어디쯤 와
                  있는지는 다른 페이지로 가야 볼 수 있었다. 매일 오는 사용자에게는
                  새 추천만큼 중요하다 — "어제 산 게 지금 어떻게 됐나".

                  손절에 가까운 순으로 세운다. 목표에 가까운 픽은 기다리면 되지만
                  손절에 가까운 픽은 지금 봐야 하는 것이기 때문이다. */}
            </section>

              {/* ── 최근 보도 ──
                  기사 제목·본문을 쓰지 않는다(언론사 저작물). 외부로 나가는 링크도 없다.
                  '같은 날 여러 매체가 동시에 다뤘다'는 사실만 세고, 그 옆에 VECTA 가
                  실제로 잰 그날 등락을 붙인다. 조용한 종목은 조용하다고 적는다 —
                  그것도 정보다. 상세는 종목명을 눌러 내부 상세로 간다. */}
              <section className="rounded-[12px] border border-border-soft bg-surface/40 p-5">
                <h2 className="mb-2 flex items-baseline gap-2 text-sm font-bold text-text">
                  최근 보도
                  <span className="text-[11px] font-medium text-text-mute">
                    최근 10일 · 같은 날 2개 매체 이상 다룬 건만
                  </span>
                </h2>
                <div className="divide-y divide-border-soft">
                  {previewPicks.map((p) => {
                    const evs = eventMap.get(p.symbol) ?? [];
                    return (
                      <div key={p.symbol} className="flex flex-wrap items-baseline gap-x-3 py-2">
                        <Link
                          href={`/stocks/${p.symbol}`}
                          className="w-[120px] shrink-0 truncate text-[16px] font-semibold text-text transition-colors hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        {evs.length === 0 ? (
                          <span className="text-[11px] text-text-mute">
                            눈에 띄는 보도 없음
                          </span>
                        ) : (
                          <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                            {evs.slice(0, 3).map((e) => (
                              <span key={e.date} className="flex items-baseline gap-1.5">
                                <span className="tnum text-[11px] text-text-mute">
                                  {e.date.slice(5).replace("-", "/")}
                                </span>
                                <span className="rounded-[4px] border border-border-strong px-1.5 py-px text-[11px] font-semibold text-text-dim">
                                  {e.outletCount}개 매체
                                </span>
                                {e.changePct != null && (
                                  <span
                                    className={`tnum text-[11px] font-medium ${
                                      e.changePct >= 0 ? "text-good" : "text-bad"
                                    }`}
                                  >
                                    {fmtPct(e.changePct)}
                                  </span>
                                )}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

              {/* 분석 전체 목록은 홈에서 걷어냈다(추천과 뒤섞여 혼란만 키움).
                  접근 경로까지 막지는 않도록 링크 하나만 남긴다. */}
              <Link
                href="/reports"
                className="mt-3 inline-block text-[11px] text-text-mute transition-colors hover:text-text-dim"
              >
                추천에 오르지 못한 종목까지 전체 분석 보기 →
              </Link>
            </section>

            {/* 추천 섹션 안에 넣었더니 '추천 종목의 부록'처럼 읽혔다. 이건 다른 질문에
                답하는 블록이다 — 추천은 "뭘 사나", 이건 "산 게 지금 어떤가". 형제로 세운다. */}
            {openPicks.length > 0 && (
              <section className="rounded-[12px] border border-border-soft bg-surface/40 p-5">
                  <h2 className="mb-2 flex items-baseline gap-2 text-sm font-bold text-text">
                    진행중인 픽
                    <span className="text-[11px] font-medium text-text-mute">
                      {openPicks.length}종목 · 손절에 가까운 순
                    </span>
                  </h2>
                  <div className="no-scrollbar overflow-x-auto">
                    <div className="grid min-w-[640px] grid-cols-[minmax(120px,1.6fr)_3rem_minmax(90px,1fr)_minmax(78px,1fr)_minmax(78px,1fr)_minmax(78px,1fr)] items-center gap-3 border-b border-border-soft px-1 pb-2 text-[11px] tracking-[0.04em] text-text-mute">
                      <span>종목</span>
                      <span className="text-right">보유</span>
                      <span className="text-right">현재가</span>
                      <span className="text-right">수익률</span>
                      <span className="text-right">목표까지</span>
                      <span className="text-right">손절까지</span>
                    </div>
                    <div className="divide-y divide-border-soft">
                      {openPicks.slice(0, 6).map((p) => {
                        // 손절까지 3% 이내면 눈에 띄게 — 사용자가 지금 결정해야 하는 것.
                        const nearStop = p.toStopPct != null && p.toStopPct > -0.03;
                        return (
                          <div
                            key={`${p.symbol}-${p.asOf}`}
                            className="grid min-w-[640px] grid-cols-[minmax(120px,1.6fr)_3rem_minmax(90px,1fr)_minmax(78px,1fr)_minmax(78px,1fr)_minmax(78px,1fr)] items-baseline gap-3 px-1 py-2.5 transition-colors hover:bg-surface"
                          >
                            <span className="flex min-w-0 items-baseline gap-1.5">
                              <Link
                                href={`/stocks/${p.symbol}`}
                                className="truncate text-[16px] font-semibold text-text hover:text-accent"
                              >
                                {p.name || p.symbol}
                              </Link>
                              {p.tp1Hit && (
                                <span className="shrink-0 rounded-[4px] bg-good-soft px-1 py-px text-[11px] font-semibold text-good">
                                  1차 익절
                                </span>
                              )}
                            </span>
                            <span className="tnum text-right text-[11px] text-text-mute">
                              {p.heldDays}일
                            </span>
                            <span className="tnum text-right text-[14px] text-text-dim">
                              {fmtPrice(p.last)}
                            </span>
                            <span
                              className={`tnum text-right text-[14px] font-semibold ${
                                (p.returnPct ?? 0) >= 0 ? "text-good" : "text-bad"
                              }`}
                            >
                              {p.returnPct != null ? fmtPct(p.returnPct) : "—"}
                            </span>
                            <span className="tnum text-right text-[11px] text-text-dim">
                              {p.toTargetPct != null ? fmtPct(p.toTargetPct) : "—"}
                            </span>
                            <span
                              className={`tnum text-right text-[11px] ${
                                nearStop ? "font-semibold text-bad" : "text-text-dim"
                              }`}
                            >
                              {p.toStopPct != null ? fmtPct(p.toStopPct) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {openPicks.length > 6 && (
                    <Link
                      href="/focus"
                      className="mt-2 inline-block text-[11px] text-text-dim transition-colors hover:text-text"
                    >
                      나머지 {openPicks.length - 6}종목 보기 →
                    </Link>
                  )}
              </section>
            )}

          {/* ── 아래 띠 ──
              예전엔 여기에 상자 3개(판정 분포·픽 트랙레코드·전략 검증)가 나란히 있었다.
              셋 다 "엔진이 얼마나 잘 하고 있나"를 말하는 메타 정보인데, 상자로 세우니
              상품(추천)과 같은 무게로 읽혔다. 한 줄로 눕힌다.

              트랙레코드는 뺐다 — 손절 로직·가격 데이터·게이트가 최근에 다 바뀌어서
              지금 남은 기록은 고치기 전 시스템의 성적이다. 그걸 현재 성적처럼 보여주는
              건 정직한 게 아니라 그냥 틀린 숫자다. 다시 켤 때는 "수정 이후 발행분"
              기준으로만 센다.

              전략 이름(median·ensemble 같은)도 뺐다. 사용자에게 아무 뜻이 없는 말이다. */}
          <dl className="rounded-[12px] border border-border-soft bg-surface/40 p-5 text-[14px] flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-mute">오늘 분석</dt>
              <dd className="tnum font-semibold text-text">{dist.total}종목</dd>
              {dist.total > 0 && (
                <span className="tnum text-[11px] text-text-mute">
                  매수 {dist.매수} · 중립 {dist.중립} · 관망 {dist.관망}
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-mute">검증 통과 전략</dt>
              <dd className="tnum font-semibold text-text">
                {kpiDisplay.backtestPassed}/{kpiDisplay.backtestTotal}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-mute">진행중인 픽</dt>
              <dd className="tnum font-semibold text-text">{openPicks.length}종목</dd>
            </div>
            <Link
              href="/strategies"
              className="text-[11px] text-text-dim transition-colors hover:text-text"
            >
              검증 상세 →
            </Link>
          </dl>
        </div>

        {/* 면책 고지 */}
        <p className="mt-8 text-center text-[11px] leading-relaxed text-text-mute">
          유사투자자문업자의 불특정 다수 대상 투자 참고 정보 · 맞춤 자문 아님 ·
          투자 판단의 책임은 투자자 본인에게 있습니다 · 과거 성과는 미래 수익을 보장하지 않습니다
        </p>
      </main>
    </div>
  );
}
