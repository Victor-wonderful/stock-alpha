import Link from "next/link";
import { GNB } from "@/components/GNB";
import {
  getDashboardKpi,
  getMarketQuotes,
  getRecommendations,
  getReports,
  getBacktests,
  getPickHistory,
  getMorningBrief,
  getLatestPricesBySymbols,
} from "@/lib/data";
import { fmtPrice, fmtPct, nextTradingDayLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { SampleBadge } from "@/components/ui";
import { PriceNow } from "@/components/PriceNow";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

// ── 셋업 키 → 한국어 표기 (검증 현황 카드)
const SETUP_NAMES: Record<string, string> = {
  leader_trend: "주도주 추세",
  oversold_bounce: "과대낙폭 반등",
  breakout: "돌파",
  close_betting: "종가베팅",
  flow_accumulation: "수급 동반 매집",
  pullback: "눌림목",
  high_52w: "52주 신고가",
  vol_squeeze: "변동성 수축 돌파",
  pead: "실적 모멘텀(PEAD)",
  double_bottom: "쌍바닥(W) 반등",
  anchor_pullback: "기준봉 눌림",
  factor_composite: "멀티팩터 종합",
};

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
      <span className="tnum text-[12px] font-medium text-text">
        {value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
        {unit && <span className="ml-0.5 text-[10px] text-text-mute">{unit}</span>}
      </span>
      {changePct != null && (
        <span className={`tnum text-[11px] ${changeColor}`}>{fmtPct(changePct)}</span>
      )}
      {sample && <span className="text-[9px] text-text-mute">예시</span>}
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
  const [kpi, quotes, recs, reports, backtests, history, brief] = await Promise.all([
    getDashboardKpi(),
    getMarketQuotes(),
    getRecommendations(),
    getReports(150), // 판정 분포 표본 — 일 발행 상한(100) 이상으로 가져와야 분포가 안 잘림
    getBacktests(),
    getPickHistory(300), // 트랙레코드 누적 집계 — 잘리면 수치가 거짓이 됨
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
  const planDay = asOf ? nextTradingDayLabel(asOf) : null;

  // 최신 분석 리포트 미리보기 — 종목(/reports) 페이지와 동일: 최신일 + 점수순 상위 6.
  const topReports = [...todayReps]
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 6);

  // 현재가·전일대비 — 종목이 나열되는 곳이면 현재가가 있어야 한다.
  // 예전엔 픽 5건만, 그것도 종목당 1회씩(5왕복) 조회해 리포트 목록엔 가격이 아예 없었다.
  // 픽과 리포트 심볼을 합쳐 벌크 1회로 가져온다(왕복 5→1).
  const previewPicks = picks.slice(0, 5);
  const priceMap = await getLatestPricesBySymbols([
    ...previewPicks.map((p) => p.symbol),
    ...topReports.map((r) => r.symbol).filter((s): s is string => !!s),
  ]);

  // 판정 분포 (리포트 기반)
  const dist = {
    매수: todayReps.filter((r) => r.rating === "매수").length,
    중립: todayReps.filter((r) => r.rating === "중립").length,
    관망: todayReps.filter((r) => r.rating === "관망").length,
    total: todayReps.length,
  };

  // 백테스트 PASS 전략 리스트 (상위 4)
  const passedBt = backtests.data.filter((b) => b.passed).slice(0, 4);

  // 진행중 픽 평균 수익
  const activePicks = history.data.filter((h) => h.status === "진행중" && h.return_pct != null);
  const avgReturn =
    activePicks.length > 0
      ? activePicks.reduce((s, h) => s + (h.return_pct ?? 0), 0) / activePicks.length
      : null;

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
              {planDay ? `${planDay} 장전 플랜` : "장전 플랜"}
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
            <p className="mt-2 text-[13px] text-text-dim">
              {asOf ? `${asOf} 종가 분석` : "종가 분석"}
              <span className="mx-2 text-border-strong">│</span>
              기준을 통과한 종목만 오릅니다
            </p>
          </div>

          <Link
            href="/focus"
            className="whitespace-nowrap rounded-[12px] bg-accent px-5 py-2.5 text-[13px] font-semibold text-[#0B0C10] transition-colors hover:bg-accent-2"
          >
            오늘의 포커스 보기
          </Link>
        </div>

        {/* ── 보조 지표 ──
            KPI 상자 4개를 한 줄 텍스트로 내렸다. 이건 오늘의 판단을 뒷받침하는
            각주이지 헤드라인이 아니다. */}
        <dl className="mb-8 flex flex-wrap items-baseline gap-x-7 gap-y-2 border-y border-border-soft py-3 text-[13px]">
          {[
            { k: "발행 리포트", v: `${kpiDisplay.reportsTotal}건` },
            { k: "검증 통과 전략", v: `${kpiDisplay.backtestPassed}/${kpiDisplay.backtestTotal}` },
            {
              k: "진행중 픽",
              v: avgReturn != null ? fmtPct(avgReturn) : "없음",
              sub: activePicks.length > 0 ? `${activePicks.length}종목` : undefined,
            },
          ].map(({ k, v, sub }) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="text-text-mute">{k}</dt>
              <dd className="tnum font-semibold text-text">{v}</dd>
              {sub && <span className="tnum text-[11px] text-text-mute">{sub}</span>}
            </div>
          ))}
        </dl>

        {/* ── 메인 2컬럼 레이아웃 ── */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          {/* 좌측: 오늘의 포커스 + 최신 분석 리포트 */}
          <div className="flex flex-col gap-6">
            {/* 오늘의 포커스 — 카드 상자를 걷고 표로 세운다.
                밀도 8 짜리 데이터에 카드 컨테이너를 씌우면 정보가 상자 안에 갇혀
                옆 패널과 같은 무게로 읽힌다. 여기선 헤어라인과 여백만 쓴다. */}
            <section>
              <div className="flex items-baseline justify-between pb-3">
                <h2 className="text-sm font-bold text-text">오늘의 포커스</h2>
                <Link
                  href="/focus"
                  className="text-xs text-text-dim transition-colors hover:text-text"
                >
                  전체 보기 →
                </Link>
              </div>
              {/* 컬럼 헤더 — 어느 숫자가 무엇인지 표가 스스로 말하게 한다.
                  예전엔 진입가·목표가·R:R 이 라벨 없이 우측에 뭉쳐 있었다. */}
              {picks.length > 0 && (
                <div className="no-scrollbar overflow-x-auto border-b border-border-soft">
                  <div className="flex min-w-[640px] items-center gap-3 px-1 pb-2 text-[10px] tracking-[0.04em] text-text-mute">
                    <span className="w-5 shrink-0">순위</span>
                    <span className="min-w-0 flex-1">종목</span>
                    <span className="w-[68px] shrink-0">스타일</span>
                    <span className="w-[52px] shrink-0">판정</span>
                    <span className="w-[104px] shrink-0 text-right">현재가</span>
                    <span className="w-[132px] shrink-0 text-right">진입 → 목표</span>
                    <span className="w-7 shrink-0 text-right">점수</span>
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
                  previewPicks.map((p, i) => (
                    // 한 행에 이름·스타일·판정·현재가·계획가·R:R·점수가 들어간다.
                    // 좁은 화면에서 잘려나가지 않도록 이 코드베이스의 표 관례대로
                    // min-w 를 주고 가로 스크롤에 맡긴다(정보를 숨기지 않는다).
                    <div
                      key={p.symbol}
                      className="flex min-w-[640px] items-center gap-3 px-1 py-3.5 transition-colors hover:bg-surface"
                    >
                      {/* 순위 — 1위에 옐로 배지를 쓰면 화면의 accent 예산을 여기서 태운다.
                          순위는 이미 위에서 아래 순서로 드러나므로 조용한 모노 숫자면 족하다. */}
                      <span className="mono w-5 shrink-0 text-[11px] tabular-nums text-text-mute">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <Link
                          href={`/stocks/${p.symbol}`}
                          className="truncate text-sm font-semibold text-text hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        <span className="mono shrink-0 text-[10px] text-text-mute">{p.symbol}</span>
                      </div>
                      <span className="w-[68px] shrink-0 text-[10px] text-text-dim">
                        {p.style}
                      </span>
                      <span className="w-[52px] shrink-0">
                        <RatingBadge rating={ratingBySymbol.get(p.symbol) ?? null} />
                      </span>
                      {/* 현재가·전일대비 — 계획가(진입→목표)와 나란히 두어 지금 위치를 읽게 한다. */}
                      <span className="w-[104px] shrink-0 text-right">
                        <PriceNow
                          close={priceMap.get(p.symbol)?.close}
                          changePct={priceMap.get(p.symbol)?.changePct}
                          date={priceMap.get(p.symbol)?.date}
                          size="xs"
                        />
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="w-[132px] shrink-0 text-right">
                          <div className="tnum text-[12px] text-text-dim">
                            {fmtPrice(p.entry_price)} → {fmtPrice(p.target_price)}
                          </div>
                          {p.entry_price && p.stop_loss && p.target_price && (
                            <div className="tnum text-[10px] text-text-mute">
                              R:R{" "}
                              {((p.target_price - p.entry_price) / (p.entry_price - p.stop_loss)).toFixed(1)}
                            </div>
                          )}
                        </div>
                        {/* 확신도 — 숫자만으로는 77 과 75 의 차이가 안 보인다.
                            얇은 막대를 붙여 종목 간 비교가 눈으로 되게 한다. */}
                        {/* 확신도 — 막대를 붙여봤지만 홈 미리보기는 상위 5건이라
                            값이 거의 같게 뭉쳐(77·77·77·77·75) 변별이 안 되고 잡음만 됐다.
                            목록이 이미 점수 내림차순이라 순서가 그 역할을 한다.
                            옐로를 뺀 것만으로 강조 예산은 회수된다. */}
                        <span className="tnum w-7 shrink-0 text-right text-sm font-bold text-text">
                          {Math.round(p.conviction * 100)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 최신 분석 리포트 — flex-1: 우측 레일과 하단 라인 정렬 */}
            <section className="flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border-soft pb-3">
                <h2 className="flex items-baseline gap-2 text-sm font-bold text-text">
                  최신 분석 리포트
                  {/* 픽이 0건인 날 바로 위에 "살 종목 없음"이 뜨는데 여기엔 '매수' 리포트가
                      줄줄이 있어 모순처럼 읽힌다. 리포트=판정, 픽=실행 계획임을 명시. */}
                  <span
                    className="text-[11px] font-medium text-text-mute"
                    title="분석·판정 결과입니다. 게이트(거래가능·국면·백테스트·진입가)를 통과해 '지금 실행 가능'으로 판정된 것만 오늘의 포커스에 오릅니다."
                  >
                    판정만 · 점수순 — 매매 계획은 &lsquo;추천&rsquo;에
                  </span>
                </h2>
                <Link href="/reports" className="text-xs text-text-dim transition-colors hover:text-text">
                  전체 보기 →
                </Link>
              </div>
              <div className="divide-y divide-border">
                {topReports.length === 0 ? (
                  <div className="px-1 py-8 text-center text-sm text-text-mute">
                    발행된 리포트가 없습니다
                  </div>
                ) : (
                  topReports.map((r) => (
                    <Link
                      key={r.id}
                      href={`/reports/${r.id}`}
                      className="flex items-center gap-3 px-1 py-3 hover:bg-surface transition-colors"
                    >
                      <RatingBadge rating={r.rating} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-text truncate">
                            {r.name ?? r.title}
                          </span>
                          {r.symbol && (
                            <span className="mono shrink-0 text-[10px] text-text-mute">
                              {r.symbol}
                            </span>
                          )}
                        </div>
                        {r.summary && (
                          <p className="mt-0.5 truncate text-[11px] text-text-mute">
                            {r.summary}
                          </p>
                        )}
                      </div>
                      {/* 현재가 — 종목이 나열되는 곳이면 지금 주가가 얼마인지 보여야 한다.
                          판정·점수만 있으면 "그래서 지금 얼마인데?"가 남는다. */}
                      <span className="hidden shrink-0 text-right sm:block">
                        <PriceNow
                          close={r.symbol ? priceMap.get(r.symbol)?.close : undefined}
                          changePct={r.symbol ? priceMap.get(r.symbol)?.changePct : undefined}
                          date={r.symbol ? priceMap.get(r.symbol)?.date : undefined}
                          size="xs"
                        />
                      </span>
                      {/* 포커스 점수와 같은 규칙 — 점수는 옐로가 아니라 굵기로 세운다. */}
                      {r.score != null && (
                        <span className="tnum w-7 shrink-0 text-right text-sm font-bold text-text">
                          {r.score}
                        </span>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* 우측 레일 */}
          <div className="flex flex-col gap-6">
            {/* 판정 분포 */}
            <section className="border-t border-border-soft pt-4">
              <h2 className="mb-3 text-sm font-bold text-text">판정 분포</h2>
              {dist.total === 0 ? (
                <p className="text-sm text-text-mute">데이터 없음</p>
              ) : (
                <>
                  {/* 누적 바 */}
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full">
                    {dist.매수 > 0 && (
                      <div
                        className="bg-good"
                        style={{ width: `${(dist.매수 / dist.total) * 100}%` }}
                      />
                    )}
                    {dist.중립 > 0 && (
                      <div
                        className="bg-warn"
                        style={{ width: `${(dist.중립 / dist.total) * 100}%` }}
                      />
                    )}
                    {dist.관망 > 0 && (
                      <div
                        className="bg-surface-3"
                        style={{ width: `${(dist.관망 / dist.total) * 100}%` }}
                      />
                    )}
                  </div>
                  {/* 범례 */}
                  <div className="mt-2.5 flex items-center gap-4">
                    {[
                      { label: "매수", count: dist.매수, color: "bg-good" },
                      { label: "중립", count: dist.중립, color: "bg-warn" },
                      { label: "관망", count: dist.관망, color: "bg-surface-3" },
                    ].map(({ label, count, color }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${color}`} />
                        <span className="text-[11px] text-text-mute">{label}</span>
                        <span className="tnum text-[11px] font-bold text-text">{count}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] text-text-mute">
                    {latestDay ?? "—"} 발행 {dist.total}건
                    {kpiDisplay.reportsTotal > dist.total &&
                      ` · 거래 부적합 ${kpiDisplay.reportsTotal - dist.total}건 제외`}
                  </p>
                </>
              )}
            </section>

            {/* 픽 트랙레코드 미니 */}
            <section className="border-t border-border-soft pt-4">
              <h2 className="mb-3 text-sm font-bold text-text">픽 트랙레코드</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    label: "목표 도달",
                    value: history.data.filter((h) => h.status === "목표 도달").length,
                    color: "text-good",
                  },
                  {
                    label: "손절",
                    value: history.data.filter((h) => h.status === "손절").length,
                    color: "text-bad",
                  },
                  {
                    // '진행중'은 경고가 아니라 중립 상태다. warn(옐로)을 쓰면
                    // 색이 의미를 잃고 화면의 옐로만 늘어난다.
                    label: "진행중",
                    value: activePicks.length,
                    color: "text-text",
                  },
                  {
                    label: "총 픽",
                    value: history.data.length,
                    color: "text-text",
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border-l border-border-soft pl-3">
                    <p className="text-[10px] text-text-mute">{label}</p>
                    <p className={`tnum mt-0.5 text-lg font-extrabold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              {avgReturn != null && (
                <div className="mt-3 border-t border-border-soft pt-3">
                  {/* 수동적인 통계에 accent 배경을 깔면 강조 예산이 새고, 옐로가
                      '중요'가 아니라 '기본값'으로 읽힌다. 부호로만 색을 준다. */}
                  <p className="text-[10px] text-text-mute">진행중 평균 수익</p>
                  {/* 색은 '보이는 값' 기준으로 정한다. 원값(-0.0002)으로 판정하면
                      화면에 0.0% 가 빨갛게 떠서 고장으로 읽힌다 — fmtPct 의 -0.0% 와 같은 부류. */}
                  <p
                    className={`tnum mt-0.5 text-xl font-bold ${
                      Number((avgReturn * 100).toFixed(1)) > 0
                        ? "text-good"
                        : Number((avgReturn * 100).toFixed(1)) < 0
                          ? "text-bad"
                          : "text-text"
                    }`}
                  >
                    {fmtPct(avgReturn)}
                  </p>
                </div>
              )}
              <Link
                href="/picks"
                className="mt-2.5 block text-xs text-text-dim transition-colors hover:text-text"
              >
                전체 기록 →
              </Link>
            </section>

            {/* 전략 검증 현황 */}
            <section className="border-t border-border-soft pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-text">전략 검증 현황</h2>
                <Link href="/strategies" className="text-xs text-text-dim transition-colors hover:text-text">
                  검증 상세 →
                </Link>
              </div>
              {passedBt.length === 0 ? (
                <p className="text-sm text-text-mute">검증 데이터 없음</p>
              ) : (
                <div className="space-y-2">
                  {passedBt.map((bt) => (
                    <div
                      key={`${bt.setup}-${bt.style}`}
                      className="flex items-center justify-between border-b border-border-soft py-2 last:border-b-0"
                    >
                      <div>
                        <span className="text-xs font-semibold text-text">
                          {SETUP_NAMES[bt.setup] ?? bt.setup}
                        </span>
                        {bt.style && (
                          <span className="ml-1.5 text-[10px] text-text-mute">{bt.style}</span>
                        )}
                        {bt.expectancy_r != null && (
                          <p className="tnum text-[10px] text-text-mute">
                            기대값 {bt.expectancy_r.toFixed(2)}R
                          </p>
                        )}
                      </div>
                      <span className="rounded-[6px] bg-good-soft px-2 py-0.5 text-[10px] font-bold text-good">
                        PASS
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
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
