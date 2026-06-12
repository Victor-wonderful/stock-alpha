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
} from "@/lib/data";
import { fmtPrice, fmtPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { SampleBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

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
}: {
  label: string;
  value: number;
  unit: string;
  changePct: number | null;
  spark: number[];
  sample?: boolean;
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

  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] bg-surface px-4 py-3 border border-border">
      <span className="text-[11px] text-text-mute">
        {label}
        {sample && <span className="ml-1 rounded-[4px] bg-surface-2 px-1 py-px text-[9px] text-text-mute">예시</span>}
      </span>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="tnum text-base font-bold text-text">
            {value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
            {unit && <span className="ml-0.5 text-xs text-text-mute">{unit}</span>}
          </span>
          {changePct != null && (
            <div className={`tnum mt-0.5 text-[11px] font-semibold ${changeColor}`}>
              {fmtPct(changePct)}
            </div>
          )}
        </div>
        <svg width="80" height="20" className="shrink-0 opacity-80" aria-hidden>
          <polyline
            points={pts}
            fill="none"
            stroke={up ? "var(--good)" : "var(--bad)"}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

// ── KPI 스탯 카드
function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-surface px-4 py-3.5 border border-border">
      <span className="text-[11px] text-text-mute">{label}</span>
      <span
        className={`tnum text-xl font-extrabold leading-none ${accent ? "text-accent" : "text-text"}`}
      >
        {value}
      </span>
      {sub && <span className="text-[11px] text-text-mute">{sub}</span>}
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
  const regimePill = regime
    ? regime.regime === "risk_off"
      ? { text: "시장 레짐 · 방어 구간", cls: "bg-bad-soft text-bad" }
      : regime.regime === "risk_on"
        ? { text: "시장 레짐 · 공격 구간", cls: "bg-good-soft text-good" }
        : { text: "시장 레짐 · 중립", cls: "bg-warn-soft text-warn" }
    : null;

  const picks = recs.isSample
    ? []
    : recs.data.filter((r) => r.basket_type === "daily_focus");
  const asOf = picks[0]?.as_of ?? null;

  // 판정 분포 (리포트 기반)
  const latestDay = reports.data[0]?.as_of ?? null;
  const todayReps = reports.data.filter((r) => r.as_of === latestDay);
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

  // KPI 오버라이드
  const kpiDisplay = {
    picksToday: picks.length || kpi.picksToday,
    reportsTotal: kpi.reportsTotal || reports.data.length,
    backtestPassed: kpi.backtestPassed,
    backtestTotal: kpi.backtestTotal,
  };

  return (
    <div className="flex min-h-screen flex-col">
      <GNB />
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-7 py-7 pb-10">
        {/* ── 페이지 헤더 ── */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-text">대시보드</h1>
            <p className="mt-0.5 text-xs text-text-mute">
              {asOf ? `${asOf} 마감 데이터 기준 · 실시간 갱신` : "실시간 갱신"}
              {quotes.isSample && " · "}
              {quotes.isSample && <SampleBadge />}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 레짐 필 — 모닝 브리프 실데이터 */}
            {regimePill && (
              <span className={`rounded-[999px] px-3 py-1.5 text-xs font-semibold ${regimePill.cls}`}>
                {regimePill.text}
              </span>
            )}
            <Link
              href="/focus"
              className="rounded-[999px] bg-accent px-4 py-1.5 text-xs font-semibold text-[#0B0C10] hover:bg-accent-2 transition-colors"
            >
              오늘의 포커스 보기
            </Link>
          </div>
        </div>

        {/* ── 마켓 스트립 — 코스피·코스닥·S&P500·나스닥·VIX·원달러·미 국채 10Y ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {quotes.data.map((q) => (
            <MarketCard
              key={q.id}
              label={q.label}
              value={q.value}
              unit={q.unit}
              changePct={q.changePct}
              spark={q.spark}
              sample={q.sample}
            />
          ))}
        </div>

        {/* ── KPI 4 스탯카드 ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="오늘의 픽"
            value={`${kpiDisplay.picksToday}종목`}
            sub="기준 통과"
            accent
          />
          <KpiCard
            label="발행 리포트"
            value={`${kpiDisplay.reportsTotal}건`}
            sub="오늘 인뎁스 발행 · 상한 100"
          />
          <KpiCard
            label="진행중 픽 수익률"
            value={avgReturn != null ? fmtPct(avgReturn) : "—"}
            sub={activePicks.length > 0 ? `${activePicks.length}종목 평균` : "진행중 없음"}
            accent={avgReturn != null && avgReturn > 0}
          />
          <KpiCard
            label="검증 통과 전략"
            value={`${kpiDisplay.backtestPassed} / ${kpiDisplay.backtestTotal}`}
            sub="PASS / 전체"
          />
        </div>

        {/* ── 메인 2컬럼 레이아웃 ── */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          {/* 좌측: 오늘의 포커스 + 최신 분석 리포트 */}
          <div className="flex flex-col gap-6">
            {/* 오늘의 포커스 미리보기 */}
            <section className="rounded-[20px] border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-text">
                  <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
                  오늘의 포커스
                </h2>
                <Link
                  href="/focus"
                  className="text-xs text-accent hover:underline"
                >
                  전체 보기 →
                </Link>
              </div>
              <div className="divide-y divide-border">
                {picks.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-text-mute">
                    {recs.isSample
                      ? "데이터 연결 후 오늘의 픽이 표시됩니다"
                      : "오늘은 기준을 통과한 종목이 없습니다"}
                  </div>
                ) : (
                  picks.slice(0, 5).map((p, i) => (
                    <div
                      key={p.symbol}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      {/* 순위 필 */}
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[11px] font-extrabold ${
                          i === 0
                            ? "bg-accent text-[#0B0C10]"
                            : "bg-surface-3 text-text-mute"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Link
                          href={`/stocks/${p.symbol}`}
                          className="truncate text-sm font-semibold text-text hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        <span className="mono shrink-0 text-[10px] text-text-mute">{p.symbol}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-surface-3 text-text-dim">
                          {p.style}
                        </span>
                        <RatingBadge rating="매수" />
                        <div className="text-right">
                          <div className="tnum text-[11px] text-text-dim">
                            {fmtPrice(p.entry_price)} → {fmtPrice(p.target_price)}
                          </div>
                          {p.entry_price && p.stop_loss && p.target_price && (
                            <div className="tnum text-[10px] text-text-mute">
                              R:R{" "}
                              {((p.target_price - p.entry_price) / (p.entry_price - p.stop_loss)).toFixed(1)}
                            </div>
                          )}
                        </div>
                        <span className="tnum text-sm font-extrabold text-accent">
                          {Math.round(p.conviction * 100)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 최신 분석 리포트 — flex-1: 우측 레일과 하단 라인 정렬 */}
            <section className="flex-1 rounded-[20px] border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-text">
                  <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
                  최신 분석 리포트
                </h2>
                <Link href="/reports" className="text-xs text-accent hover:underline">
                  전체 보기 →
                </Link>
              </div>
              <div className="divide-y divide-border">
                {reports.data.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-text-mute">
                    발행된 리포트가 없습니다
                  </div>
                ) : (
                  reports.data.slice(0, 6).map((r) => (
                    <Link
                      key={r.id}
                      href={`/reports/${r.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors"
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
                      {r.score != null && (
                        <span className="tnum shrink-0 text-sm font-extrabold text-accent">
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
            <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
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
            <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
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
                    label: "진행중",
                    value: activePicks.length,
                    color: "text-warn",
                  },
                  {
                    label: "총 픽",
                    value: history.data.length,
                    color: "text-text",
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-[10px] bg-surface-2 px-3 py-2.5">
                    <p className="text-[10px] text-text-mute">{label}</p>
                    <p className={`tnum mt-0.5 text-lg font-extrabold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              {avgReturn != null && (
                <div className="mt-3 rounded-[10px] bg-accent-soft border border-accent/20 px-3 py-2.5">
                  <p className="text-[10px] text-text-mute">진행중 평균 수익</p>
                  <p
                    className={`tnum mt-0.5 text-xl font-extrabold ${avgReturn >= 0 ? "text-accent" : "text-bad"}`}
                  >
                    {fmtPct(avgReturn)}
                  </p>
                </div>
              )}
              <Link
                href="/picks"
                className="mt-2.5 block text-xs text-accent hover:underline"
              >
                전체 기록 →
              </Link>
            </section>

            {/* 전략 검증 현황 */}
            <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-text">전략 검증 현황</h2>
                <Link href="/strategies" className="text-xs text-accent hover:underline">
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
                      className="flex items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2"
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
