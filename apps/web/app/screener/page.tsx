import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SampleBadge } from "@/components/ui";
import { Crosshair, TrendingUp } from "lucide-react";
import { getSignals, getAlphaZoneStocks, getLatestPricesBySymbols, getSignalCounts, getSignalsBySetups, getBacktests, countSignalsForCombos } from "@/lib/data";
import { fmtPrice, fmtPct, fmtNum } from "@/lib/format";
import { holdingLabel, holdingApprox } from "@/lib/holding";
import type { SignalView } from "@/lib/types";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

// ── 셋업 메타 ──
const SETUP_LABELS: Record<string, string> = {
  leader_trend: "주도주 추세",
  oversold_bounce: "과매도 반등",
  breakout: "돌파 매수",
  close_betting: "종가 베팅",
  factor_composite: "팩터 종합",
  kalman: "칼만 추세",
  flow_accumulation: "수급 동반 매집",
  pivot: "피봇 돌파",
  median: "메디안 추세",
  ensemble: "앙상블 합의",
  sortino: "소르티노 모멘텀",
  bayes: "베이즈 결합",
};
const STYLE_LABELS: Record<string, string> = {
  swing: "스윙",
  position: "포지션",
  day: "데이트레이딩",
  scalping: "스캘핑",
};

function initials(name: string): string {
  return name.length >= 2 ? name.slice(0, 2) : name;
}

// 12봉 스파크바 (종가 배열 → 미니 SVG-like div 바)
function SparkBars({ data }: { data: number[] }) {
  if (!data || data.length === 0) {
    return <span className="text-[10px] text-text-mute">—</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const last = data[data.length - 1];
  const first = data[0];
  const up = last >= first;
  return (
    <div className="flex items-end gap-[1px]" aria-label="12일 추세">
      {data.map((v, i) => {
        const h = Math.round(((v - min) / range) * 16) + 2;
        return (
          <div
            key={i}
            style={{ height: h }}
            className={`w-[3px] rounded-sm ${up ? "bg-good/70" : "bg-bad/70"}`}
          />
        );
      })}
    </div>
  );
}

function SetupPill({ setup }: { setup: string }) {
  const label = SETUP_LABELS[setup] ?? setup;
  return (
    <span className="inline-flex items-center rounded-[6px] bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-500/25 whitespace-nowrap">
      {label}
    </span>
  );
}

function StylePill({ style }: { style: string }) {
  const label = STYLE_LABELS[style] ?? style;
  const locked = style === "day" || style === "scalping";
  if (locked) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-[6px] bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-text-mute ring-1 ring-inset ring-border whitespace-nowrap opacity-60">
        🔒 {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-[6px] bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-500/25 whitespace-nowrap">
      {label}
    </span>
  );
}

function AiJudge({
  signal,
}: {
  signal: SignalView;
}) {
  // 시그널에 AI 판정 정보가 없으면 "리포트 없음" 표시
  // (리포트 연결은 /reports/[id] 상세에서 처리 — 여기선 strength 점수 표시)
  const score = Math.round(signal.strength * 100);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tnum text-sm font-extrabold text-accent">{score}</span>
      <span className="text-[9px] text-text-mute">리포트 없음</span>
    </div>
  );
}

// ── 하이라이트 집계 ──
function computeHighlights(signals: SignalView[]) {
  const today = signals.length;
  // 셋업별 최다
  const setupCount = new Map<string, number>();
  for (const s of signals) {
    setupCount.set(s.setup, (setupCount.get(s.setup) ?? 0) + 1);
  }
  const topSetup = [...setupCount.entries()].sort((a, b) => b[1] - a[1])[0];
  // 최고 합성 알파 (strength 기준)
  const topAlpha = signals.reduce((m, s) => Math.max(m, s.strength), 0);
  // 평균 손익비
  const rrList = signals.map((s) => s.risk_reward).filter((v): v is number => v != null);
  const avgRr = rrList.length > 0 ? rrList.reduce((a, b) => a + b, 0) / rrList.length : null;
  return { today, topSetup, topAlpha, avgRr };
}

// 게이트 통과·발행 중인 셋업만(유령 필터 금지). ScreenerFilters.ACTIVE_SETUPS 와 동일 기준.
// 카운트 조회가 컴포넌트 상단에서 필요해 모듈 상수로 둔다.
const ALL_SETUPS: Array<{ key: string; label: string }> = [
  { key: "leader_trend", label: "주도주 추세" },
  { key: "flow_accumulation", label: "수급 매집" },
  { key: "pullback", label: "눌림목" },
  { key: "breakout", label: "돌파" },
  { key: "high_52w", label: "52주 신고가" },
  { key: "vol_squeeze", label: "변동성 수축" },
  { key: "pead", label: "실적 서프라이즈" },
];

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const activeSetup = sp.setup ?? null;
  const activeStyle = sp.style ?? null;
  const activeMarket = sp.market ?? null;
  const search = sp.q ?? "";
  const near = sp.near === "1"; // 진입 가능 — 현재가가 진입가 ±3% (알파존 흡수)

  // 필터를 DB 로 내린다. 예전엔 강도 상위 1000건을 받아 JS 로 걸렀는데, 전체가
  // 2530건이라 표본에 없는 셋업은 필터를 눌러도 0건으로 보였다(수급 매집 실제 303건).
  // 표시 상한(MAX_ROWS)만큼만 받고, 정확한 건수는 count 로 따로 받는다.
  const MAX_ROWS = 100;
  const {
    data: rows,
    isSample,
    total: filteredTotal,
  } = await getSignals(
    {
      setup: activeSetup ?? undefined,
      style: activeStyle ?? undefined,
      market: activeMarket ?? undefined,
    },
    MAX_ROWS,
  );

  // 종목명·코드 검색만 클라이언트에서 — DB 필터에 없는 조건이라 받은 페이지 안에서 거른다.
  let visibleRows = rows;
  if (search) {
    const q = search.toLowerCase();
    visibleRows = visibleRows.filter(
      (s) => s.name.toLowerCase().includes(q) || s.symbol.includes(q),
    );
  }
  // 진입 가능 — 현재가가 진입가 ±3% 인 종목만(알파존 로직 재사용: 대량 OHLCV 일괄 조회).
  if (near) {
    const { data: zoneCards } = await getAlphaZoneStocks(500);
    const zoneSet = new Set(zoneCards.map((c) => c.symbol));
    visibleRows = visibleRows.filter((s) => zoneSet.has(s.symbol));
  }

  const visible = visibleRows;
  // 조건에 맞는 전체 건수(DB count)와 화면에 그린 수의 차이 — 잘린 사실을 밝히기 위함.
  const truncated = Math.max(0, filteredTotal - visible.length);

  // ── 검증 상태 — 화면이 "검증 통과 셋업만"이라고 말하려면 그게 사실이어야 한다 ──
  // signals 는 자연키 업서트라 과거 시그널이 재발동 전까지 남는다. 그래서 «지금
  // 게이트를 통과한 조합»과 «테이블에 있는 조합»이 다르다(2026-08-21 실측: 2,750건
  // 중 통과 조합은 123건뿐). 셋업 필터 목록도 코드에 하드코딩돼 실제 게이트와
  // 어긋나 있었다. 판정을 backtests 에서 읽어 행마다 표시한다.
  const gate = await getBacktests();
  const passingCombos = new Set(
    gate.data.filter((b) => b.passed).map((b) => `${b.setup}|${b.style ?? ""}`),
  );
  const isVerified = (setup: string, style: string) =>
    passingCombos.has(`${setup}|${style}`);
  const verifiedCount = await countSignalsForCombos(
    gate.data
      .filter((b) => b.passed && b.style)
      .map((b) => ({ setup: b.setup as string, style: b.style as string })),
  );

  // 현재가 — 진입가만 보여주면 "지금 사도 되는 자리인가"를 판단할 수 없다.
  // 그리는 행만 벌크 1회로 가져온다(종목당 조회는 행 수만큼 왕복이 된다).
  const priceMap = await getLatestPricesBySymbols(visible.map((s) => s.symbol));

  // 칩 건수·전체 건수는 표본이 아니라 DB count 로 — 셋업 7개를 병렬 head-count.
  const { total: grandTotal, bySetup: setupCounts } = await getSignalCounts(
    ALL_SETUPS.map((x) => x.key),
  );
  // 필터가 하나도 없으면 '셋업별 섹션' 뷰. 1000행 표를 훑게 하는 대신
  // 오늘 어떤 셋업이 떴는지를 덩어리로 보여주고, 칩을 누르면 그 셋업 표로 파고든다.
  const sectionView = !activeSetup && !activeStyle && !activeMarket && !search && !near;
  const bySetupRows = sectionView
    ? await getSignalsBySetups(ALL_SETUPS.map((x) => x.key), 5)
    : new Map<string, typeof visible>();
  const sectionSymbols = sectionView
    ? [...bySetupRows.values()].flat().map((r) => r.symbol)
    : [];
  const sectionPrices = sectionView
    ? await getLatestPricesBySymbols(sectionSymbols)
    : new Map();

  const hl = computeHighlights(visible);
  // 최다 셋업도 표본이 아니라 전체 카운트에서 뽑는다.
  const topSetupEntry = [...setupCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const buildHref = (key: string, value: string | null) => {
    const p = new URLSearchParams();
    if (activeSetup && key !== "setup") p.set("setup", activeSetup);
    if (activeStyle && key !== "style") p.set("style", activeStyle);
    if (activeMarket && key !== "market") p.set("market", activeMarket);
    if (near && key !== "near") p.set("near", "1");
    if (search) p.set("q", search);
    if (value) p.set(key, value);
    const qs = p.toString();
    return qs ? `?${qs}` : "/screener";
  };


  return (
    <AppShell
      title="스크리너"
      subtitle={`시그널 ${grandTotal}건 — 셋업이 트리거된 기록이다. 매수 추천이 아니고, «검증 통과»만 실제 발행 대상이다 · 매일 16:30 갱신`}
      badge={
        <span className="flex items-center gap-1.5 rounded-[999px] bg-good-soft px-3 py-1 text-[11px] font-bold text-good">
          검증 통과 {verifiedCount}건 · 미통과 {grandTotal - verifiedCount}건
        </span>
      }
    >
      {/* 스크리너 = 독립 시그널 탐색 메뉴(IA 2026-06-24). 추천 탭·국면 헤더 없음 — 순수 탐색 도구. */}
      {isSample && (
        <div className="mb-4">
          <SampleBadge />
        </div>
      )}

      {/* 하이라이트 카드 4 */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          // 값의 근거를 부제에 명시한다. 예전엔 전부 '강도 상위 1000건 표본' 기준이면서
          // 라벨은 전체인 것처럼 적혀 있었다(오늘 신규 1000건 vs 실제 2530건).
          { label: "시그널 전체", value: `${grandTotal}건`, sub: `그중 검증 통과 ${verifiedCount}건` },
          {
            label: "최다 셋업",
            value: topSetupEntry ? SETUP_LABELS[topSetupEntry[0]] ?? topSetupEntry[0] : "—",
            sub: topSetupEntry ? `${topSetupEntry[1]}건 · 전체 기준` : "",
          },
          { label: "최고 합성알파", value: fmtNum(hl.topAlpha, 2), sub: "강도 최상위" },
          { label: "평균 손익비", value: hl.avgRr != null ? `${fmtNum(hl.avgRr, 1)} R:R` : "—", sub: `표시된 ${visible.length}건 평균` },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="rounded-[12px] border border-border bg-surface p-4"
          >
            <p className="text-[11px] text-text-mute">{label}</p>
            <p className="tnum mt-1 text-xl font-extrabold text-accent">{value}</p>
            {sub && <p className="mt-0.5 text-[10px] text-text-mute">{sub}</p>}
          </div>
        ))}
      </div>

      {/* 빠른 필터 — 평이한 명사(IA 2026-06-24): 진입 가능(알파존 흡수)·수급 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-text-mute">빠른 필터</span>
        <Link
          href={near ? buildHref("near", null) : buildHref("near", "1")}
          className={`flex items-center gap-1.5 rounded-[999px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            near
              ? "border-accent bg-accent text-text-on-accent"
              : "border-border bg-surface-2 text-text hover:border-accent"
          }`}
        >
          <Crosshair className={`h-3.5 w-3.5 ${near ? "text-text-on-accent" : "text-accent"}`} /> 진입 가능
          <span className={`font-medium ${near ? "text-text-on-accent/70" : "text-text-mute"}`}>현재가가 진입가 부근</span>
        </Link>
        <Link
          href={buildHref("setup", "flow_accumulation")}
          className={`flex items-center gap-1.5 rounded-[999px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeSetup === "flow_accumulation"
              ? "border-accent bg-accent text-text-on-accent"
              : "border-border bg-surface-2 text-text hover:border-accent"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5 text-accent" /> 수급
          <span
            className={`font-medium ${activeSetup === "flow_accumulation" ? "text-text-on-accent/70" : "text-text-mute"}`}
          >
            외국인·기관 순매수
          </span>
        </Link>
      </div>

      {/* 셋업 필터 칩 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Link
          href={buildHref("setup", null)}
          className={`rounded-[999px] px-3 py-1.5 text-xs font-semibold transition-colors ${
            !activeSetup
              ? "bg-accent text-text-on-accent"
              : "border border-border bg-surface text-text-dim hover:border-border-strong hover:text-text"
          }`}
        >
          전체 {grandTotal}
        </Link>
        {ALL_SETUPS.map(({ key, label }) => {
          const cnt = setupCounts.get(key) ?? 0;
          const isActive = activeSetup === key;
          return (
            <Link
              key={key}
              href={buildHref("setup", key)}
              className={`rounded-[999px] px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-accent text-text-on-accent"
                  : "border border-border bg-surface text-text-dim hover:border-border-strong hover:text-text"
              }`}
            >
              {label} {cnt}
            </Link>
          );
        })}
        {/* 비활성 칩 */}
        <span className="rounded-[999px] border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-text-mute opacity-50 cursor-not-allowed">
          🧪 멀티팩터 종합 — 검증 미통과 · 발행 중지
        </span>
      </div>

      {/* 2차 필터: 스타일 + 거래소 + 검색 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* 스타일 칩 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: null, label: "전체" },
            { key: "swing", label: "스윙" },
            { key: "position", label: "포지션" },
          ].map(({ key, label }) => (
            <Link
              key={label}
              href={buildHref("style", key)}
              className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors ${
                activeStyle === key
                  ? "bg-surface-3 text-text ring-1 ring-border-strong"
                  : "text-text-mute hover:text-text-dim"
              }`}
            >
              {label}
            </Link>
          ))}
          {/* 비활성 스타일 */}
          {["데이트레이딩", "스캘핑"].map((label) => (
            <span
              key={label}
              className="rounded-[8px] px-2.5 py-1 text-xs font-medium text-text-mute opacity-40 cursor-not-allowed"
              title="실시간 연동 후 활성화"
            >
              🔒 {label} · 실시간 연동 후
            </span>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* 거래소 칩 */}
        {[
          { key: null, label: "전체 시장" },
          { key: "KOSPI", label: "KOSPI" },
          { key: "KOSDAQ", label: "KOSDAQ" },
        ].map(({ key, label }) => (
          <Link
            key={label}
            href={buildHref("market", key)}
            className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors ${
              activeMarket === key
                ? "bg-surface-3 text-text ring-1 ring-border-strong"
                : "text-text-mute hover:text-text-dim"
            }`}
          >
            {label}
          </Link>
        ))}

        {/* 검색 — 서버 액션 없이 클라이언트 GET */}
        <form method="get" action="/screener" className="ml-auto">
          {activeSetup && <input type="hidden" name="setup" value={activeSetup} />}
          {activeStyle && <input type="hidden" name="style" value={activeStyle} />}
          {activeMarket && <input type="hidden" name="market" value={activeMarket} />}
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="종목명 · 코드 검색"
            className="h-8 w-44 rounded-[8px] border border-border bg-surface-2 px-3 text-xs text-text placeholder:text-text-mute focus:border-accent focus:outline-none"
          />
        </form>
      </div>

      {/* 셋업별 섹션 — 기본 화면 */}
      {sectionView ? (
        <div className="flex flex-col gap-7">
          {ALL_SETUPS.map(({ key, label }) => {
            const rows = bySetupRows.get(key) ?? [];
            const cnt = setupCounts.get(key) ?? 0;
            return (
              <section key={key}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border-soft pb-2.5">
                  <h2 className="flex items-baseline gap-2 text-sm font-bold text-text">
                    {label}
                    <span className="tnum text-[11px] font-medium text-text-mute">
                      {cnt}건
                    </span>
                  </h2>
                  {cnt > 0 && (
                    <Link
                      href={`?setup=${key}`}
                      className="text-xs text-text-dim transition-colors hover:text-text"
                    >
                      전체 보기 →
                    </Link>
                  )}
                </div>
                {rows.length === 0 ? (
                  <p className="py-4 text-[12px] text-text-mute">
                    오늘 이 셋업의 시그널은 없습니다.
                  </p>
                ) : (
                  <div className="no-scrollbar divide-y divide-border-soft overflow-x-auto">
                    {rows.map((r) => {
                      const px = sectionPrices.get(r.symbol);
                      return (
                        <Link
                          key={r.id}
                          href={`/stocks/${r.symbol}`}
                          className="grid min-w-[660px] grid-cols-[minmax(140px,2fr)_6.5rem_minmax(110px,1.4fr)_minmax(130px,1.6fr)_3.5rem_3rem] items-center gap-3 px-1 py-3 transition-colors hover:bg-surface"
                        >
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="truncate text-[13px] font-semibold text-text">
                              {r.name}
                            </span>
                            <span className="mono shrink-0 text-[10px] text-text-mute">
                              {r.symbol}
                            </span>
                          </span>
                          {/* 스타일 + 보유기간 — "언제까지 들고 있나"를 목록에서 바로 본다.
                              이 기간이 지나면 엔진이 종가로 자동 청산한다. */}
                          <span className="flex flex-col leading-tight">
                            <span className="text-[10px] text-text-dim">
                              {STYLE_LABELS[r.style] ?? r.style}
                            </span>
                            <span className="text-[10px] text-text-mute">
                              {holdingLabel(r.style)}
                            </span>
                            {!isVerified(r.setup, r.style) && (
                              <span className="text-[10px] font-semibold text-warn">
                                ⚠ 미검증
                              </span>
                            )}
                          </span>
                          <span className="mono whitespace-nowrap text-right text-[12px]">
                            {px ? (
                              <>
                                <span className="font-semibold text-text">{fmtPrice(px.close)}</span>
                                {px.changePct != null && (
                                  <span className={`ml-1 text-[10px] ${px.changePct >= 0 ? "text-good" : "text-bad"}`}>
                                    {fmtPct(px.changePct)}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-text-mute">—</span>
                            )}
                          </span>
                          <span className="tnum text-right text-[12px] text-text-dim">
                            {fmtPrice(r.entry_price)} → {fmtPrice(r.tp1)}
                          </span>
                          <span className="tnum text-right text-[11px] text-text-mute">
                            {r.risk_reward != null ? `${fmtNum(r.risk_reward, 1)}R` : "—"}
                          </span>
                          <span className="tnum text-right text-[13px] font-bold text-text">
                            {fmtNum(r.strength, 2)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[12px] border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-text-mute">조건에 맞는 시그널이 없습니다. 필터를 바꿔보세요.</p>
        </div>
      ) : (
        <div className="rounded-[12px] border border-border bg-surface overflow-hidden">
          {/* 잘린 건수를 밝힌다 — 상한을 숨기면 사용자는 이게 전부라고 믿는다. */}
          <div className="flex flex-wrap items-baseline gap-x-2 border-b border-border px-4 py-2.5 text-[11px]">
            <span className="text-text-dim">
              합성알파 상위{" "}
              <span className="tnum font-semibold text-text">{visible.length}</span>건 표시
            </span>
            {truncated > 0 && (
              <span className="text-text-mute">
                (조건에 맞는 <span className="tnum">{filteredTotal}</span>건 중{" "}
                <span className="tnum">{truncated}</span>건은 생략 — 필터로 좁혀 보세요)
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  {[
                    "종목",
                    "셋업",
                    "스타일",
                    "보유기간",
                    "신호일",
                    "현재가",
                    "진입가",
                    "목표가",
                    "손절가",
                    "R:R",
                    "합성알파",
                    "12일 추세",
                    "AI 판정",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-[10px] font-medium text-text-mute first:pl-5"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const tpPct =
                    s.tp1 != null && s.entry_price
                      ? (s.tp1 - s.entry_price) / s.entry_price
                      : null;
                  const slPct =
                    s.stop_loss != null && s.entry_price
                      ? (s.stop_loss - s.entry_price) / s.entry_price
                      : null;
                  const dateStr = s.created_at.slice(0, 10);
                  const spark = s.spark ?? [];

                  return (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors"
                    >
                      {/* 종목 */}
                      <td className="py-3 pl-5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
                            {initials(s.name)}
                          </span>
                          <div>
                            <Link
                              href={`/stocks/${s.symbol}`}
                              className="block text-[13px] font-bold text-text hover:text-accent"
                            >
                              {s.name}
                            </Link>
                            <span className="mono text-[10px] text-text-mute">{s.symbol}</span>
                          </div>
                        </div>
                      </td>

                      {/* 셋업 */}
                      <td className="px-3 py-3">
                        <SetupPill setup={s.setup} />
                      </td>

                      {/* 스타일 */}
                      <td className="px-3 py-3">
                        <StylePill style={s.style} />
                      </td>

                      {/* 보유기간 — "언제까지 들고 있나"에 화면이 답해야 한다.
                          엔진이 이 기간이 지나면 종가로 자동 청산한다. */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-[11px] font-semibold text-text-dim">
                          {holdingLabel(s.style)}
                        </span>
                        {holdingApprox(s.style) && (
                          <span className="ml-1 text-[10px] text-text-mute">
                            {holdingApprox(s.style)}
                          </span>
                        )}
                        {!isVerified(s.setup, s.style) && (
                          <span className="mt-0.5 block text-[10px] font-semibold text-warn">
                            ⚠ 미검증 — 발행 대상 아님
                          </span>
                        )}
                      </td>

                      {/* 신호일 */}
                      <td className="mono px-3 py-3 text-[11px] text-text-mute">
                        {dateStr}
                      </td>

                      {/* 현재가 — 진입가 바로 왼쪽에 둬야 "지금 자리인지"가 눈으로 비교된다. */}
                      <td className="mono px-3 py-3 whitespace-nowrap">
                        {priceMap.get(s.symbol) ? (
                          <>
                            <span className="text-[13px] font-semibold text-text">
                              {fmtPrice(priceMap.get(s.symbol)!.close)}
                            </span>
                            {priceMap.get(s.symbol)!.changePct != null && (
                              <span
                                className={`ml-1 text-[10px] ${
                                  priceMap.get(s.symbol)!.changePct! >= 0 ? "text-good" : "text-bad"
                                }`}
                              >
                                {fmtPct(priceMap.get(s.symbol)!.changePct)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[11px] text-text-mute">—</span>
                        )}
                      </td>

                      {/* 진입가 */}
                      <td className="mono px-3 py-3 text-[13px] font-semibold text-text">
                        {fmtPrice(s.entry_price)}
                      </td>

                      {/* 목표가 */}
                      <td className="mono px-3 py-3">
                        <span className="text-[13px] font-semibold text-good">
                          {fmtPrice(s.tp1)}
                        </span>
                        {tpPct != null && (
                          <span className="ml-1 text-[10px] text-good">
                            {fmtPct(tpPct)}
                          </span>
                        )}
                      </td>

                      {/* 손절가 */}
                      <td className="mono px-3 py-3">
                        <span className="text-[13px] font-semibold text-bad">
                          {fmtPrice(s.stop_loss)}
                        </span>
                        {slPct != null && (
                          <span className="ml-1 text-[10px] text-bad/70">
                            {fmtPct(slPct)}
                          </span>
                        )}
                      </td>

                      {/* R:R */}
                      <td className="mono px-3 py-3">
                        <span
                          className={`text-[13px] font-bold ${
                            (s.risk_reward ?? 0) >= 2
                              ? "text-accent"
                              : (s.risk_reward ?? 0) >= 1.3
                                ? "text-good"
                                : "text-text-mute"
                          }`}
                        >
                          {s.risk_reward != null ? fmtNum(s.risk_reward, 1) : "—"}
                        </span>
                      </td>

                      {/* 합성알파 */}
                      <td className="mono px-3 py-3 text-[13px] font-semibold text-text-dim">
                        {fmtNum(s.strength, 2)}
                      </td>

                      {/* 12일 추세 스파크바 */}
                      <td className="px-3 py-3">
                        <SparkBars data={spark} />
                      </td>

                      {/* AI 판정 */}
                      <td className="px-3 py-3">
                        <AiJudge signal={s} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 하단 주의문 */}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-text-mute">
        시그널은 매수 추천이 아닌 셋업 트리거 기록 — 판단 기준은 리포트의 실행 플랜
      </p>
    </AppShell>
  );
}
