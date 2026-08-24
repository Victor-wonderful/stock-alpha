import Link from "next/link";
import { TRADE_SETUP_LABELS } from "@stock-alpha/db";
import { SymbolCode } from "@/components/SymbolCode";
import { AppShell } from "@/components/AppShell";
import { SampleBadge } from "@/components/ui";
import { Crosshair, TrendingUp } from "lucide-react";
import {
  getSignals,
  getAlphaZoneStocks,
  getLatestPricesBySymbols,
  getSetupCounts,
  getSignalsBySetups,
  getBacktests,
  countSignalsForCombos,
} from "@/lib/data";
import { fmtPrice, fmtPct, fmtNum, tradingDayLabel } from "@/lib/format";
import {
  holdingLabel,
  holdingApprox,
  horizonLabel,
  HORIZONS,
  PUBLISH_HORIZONS,
} from "@/lib/holding";
import type { SignalView } from "@/lib/types";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

// ── 셋업 메타 ──
// 셋업 이름표는 packages/db 의 TRADE_SETUP_LABELS **하나만** 쓴다(2026-08-23).
// 여기에 지역 목록이 따로 있어 같은 셋업을 두 이름으로 불렀다 — db 는 「돌파」인데
// 화면은 「돌파 매수」, db 는 「과대낙폭 반등」인데 화면은 「과매도 반등」이었다.
// 게다가 그 지역 목록에 없는 셋업은 영문 키가 그대로 노출됐다.

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
  const label = TRADE_SETUP_LABELS[setup as keyof typeof TRADE_SETUP_LABELS] ?? setup;
  return (
    <span className="inline-flex items-center rounded-[6px] bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-500/25 whitespace-nowrap">
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
  // 평균 손익비(R:R)는 더 세지 않는다 — «목표에서 판다»를 전제한 값이라 채택 규칙
  // (trail)에서는 실현되지 않는다. 홈·오늘의 픽에서 같은 이유로 지웠다.
  return { today, topSetup, topAlpha };
}

// 셋업 목록은 **DB 에서 만든다**(2026-08-23). 예전에는 여기 7개가 박혀 있었는데,
// 그 목록에 없는 셋업은 칩으로도 섹션으로도 나오지 않았다 — 실측: 시그널 264건 중
// 115건(sortino 58 · bayes 55 · double_bottom 2)이 통째로 안 보였고, 화면은
// 「전체 264」인데 섹션 합은 149 였다. 그중 double_bottom 은 그날 발행된 픽(오리온)이
// 실제로 쓴 셋업이다 — 오늘의 픽에 오른 셋업을 스크리너에서 고를 수가 없었다.
//
// 이름은 packages/db 의 TRADE_SETUP_LABELS 하나만 쓴다. 예전 목록은 여기에 라벨을
// 또 적어 두 곳이 어긋났다(같은 셋업을 화면은 「수급 매집」, db 는 「수급 동반 매집」
// 이라 불렀다).

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const activeSetup = sp.setup ?? null;
  // 축은 기간 하나다 — style 파라미터는 더 받지 않는다(2026-08-23 Victor).
  const activeHorizon = sp.horizon ?? null;
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
      horizon: activeHorizon ?? undefined,
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
  // 축은 기간(short/mid/long)이다. 기간 도입 전 행만 style 로 폴백한다.
  const passingCombos = new Set(
    gate.data
      .filter((b) => b.passed)
      .map((b) => `${b.setup}|${b.horizon ?? b.style ?? ""}`),
  );
  const isVerified = (setup: string, horizon: string | null | undefined, style: string) =>
    passingCombos.has(`${setup}|${horizon ?? style}`);
  const passedRows = gate.data.filter((b) => b.passed);
  const verifiedCount = await countSignalsForCombos(
    passedRows.map((b) => ({
      setup: b.setup as string,
      horizon: (b.horizon as string) ?? null,
      style: (b.style as string) ?? null,
    })),
  );
  // 「검증 통과」와 「오늘의 픽으로 발행」은 다르다 — 이 화면이 둘을 같은 말로 쓰고
  // 있었다(2026-08-23 Victor). 실측: 시그널 264건 전부 게이트를 통과하지만 그중
  // 252건(95%)이 장기라 픽으로는 안 나간다. 발행은 단기·중기만이다.
  // 스크리너는 탐색 도구라 장기를 계속 보여준다 — 다만 «발행 대상»이라 부르지 않는다.
  const publishableCount = await countSignalsForCombos(
    passedRows
      .filter((b) => b.horizon && PUBLISH_HORIZONS.includes(b.horizon as never))
      .map((b) => ({ setup: b.setup as string, horizon: b.horizon as string, style: null })),
  );

  // 기준일 — 화면이 어느 시점의 값인지 머리에서 말한다. signals 는 as_of 컬럼이 없어
  // 가장 최근 created_at 을 쓴다(배치가 하루 한 번이라 곧 발생일이다).
  const sigDay = rows[0]?.created_at?.slice(0, 10) ?? null;

  // 현재가 — 진입가만 보여주면 "지금 사도 되는 자리인가"를 판단할 수 없다.
  // 그리는 행만 벌크 1회로 가져온다(종목당 조회는 행 수만큼 왕복이 된다).
  const priceMap = await getLatestPricesBySymbols(visible.map((s) => s.symbol));

  // 칩 건수·전체 건수는 표본이 아니라 DB 집계로. 있는 셋업만, 많은 순으로 온다.
  const { total: grandTotal, bySetup: setupCounts } = await getSetupCounts();
  const ALL_SETUPS = [...setupCounts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => ({
      key,
      label: TRADE_SETUP_LABELS[key as keyof typeof TRADE_SETUP_LABELS] ?? key,
    }));
  // 필터가 하나도 없으면 '셋업별 섹션' 뷰. 1000행 표를 훑게 하는 대신
  // 오늘 어떤 셋업이 떴는지를 덩어리로 보여주고, 칩을 누르면 그 셋업 표로 파고든다.
  const sectionView = !activeSetup && !activeHorizon && !activeMarket && !search && !near;
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
    if (activeHorizon && key !== "horizon") p.set("horizon", activeHorizon);
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
      asOf={sigDay ? `${tradingDayLabel(sigDay)} 기준` : null}
      subtitle="셋업이 트리거된 기록입니다. 매수 추천이 아닙니다 · 매일 16:30 갱신"
      stats={[
        { label: "시그널", value: `${grandTotal}` },
        { label: "게이트 통과", value: `${Math.min(verifiedCount, grandTotal)}` },
        // 이 화면에서 가장 중요한 한 칸 — 264건 중 실제로 픽이 될 수 있는 수.
        { label: "픽 발행 대상", value: `${publishableCount}`, tone: "accent" as const },
      ]}
    >
      {/* 스크리너 = 독립 시그널 탐색 메뉴. 추천 탭·국면 헤더 없음 — 순수 탐색 도구. */}
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
          {
              label: "시그널 전체",
              value: `${grandTotal}건`,
              // 두 수는 각자 캐시되므로 잠깐 어긋날 수 있다 — 전체보다 큰 «통과»는 없다.
              sub: `그중 게이트 통과 ${Math.min(verifiedCount, grandTotal)}건`,
            },
          {
            label: "최다 셋업",
            value: topSetupEntry
              ? TRADE_SETUP_LABELS[topSetupEntry[0] as keyof typeof TRADE_SETUP_LABELS] ??
                topSetupEntry[0]
              : "—",
            sub: topSetupEntry ? `${topSetupEntry[1]}건 · 전체 기준` : "",
          },
          { label: "최고 합성알파", value: fmtNum(hl.topAlpha, 2), sub: "강도 최상위" },
          // 「평균 손익비 R:R」을 걷어냈다(2026-08-23). (목표−진입)/(진입−손절) 은
          // «목표에서 판다»를 전제한 값인데 채택 규칙(trail)은 목표에서 팔지 않는다 —
          // 홈·오늘의 픽에서 같은 이유로 지운 말이다. 대신 이 화면이 답해야 할 질문을
          // 놓는다: 이 중 몇 개가 실제로 픽이 될 수 있나.
          {
            label: "픽 발행 대상",
            value: `${publishableCount}건`,
            sub: `단기·중기만 · 장기 ${Math.max(0, grandTotal - publishableCount)}건은 탐색용`,
          },
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
      </div>

      {/* 2차 필터: 기간 + 거래소 + 검색
          「스윙·포지션」 같은 스타일 이름을 쓰지 않는다(2026-08-23 Victor). 축은
          기간(단기·중기·장기) 하나다 — 스타일은 기간 축 도입 전 이름이고, 두 축이
          한 화면에 같이 있으면 사용자는 둘이 다른 것인 줄 안다. 잠긴 칩
          (🔒데이트레이딩·🔒스캘핑)도 없앤다 — 없는 기능을 자리로 잡아 둘 이유가 없다. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* 기간 칩 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: null, label: "전체" },
            ...HORIZONS.map((h) => ({ key: h.key as string | null, label: h.label })),
          ].map(({ key, label }) => (
            <Link
              key={label}
              href={buildHref("horizon", key)}
              className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors ${
                activeHorizon === key
                  ? "bg-surface-3 text-text ring-1 ring-border-strong"
                  : "text-text-mute hover:text-text-dim"
              }`}
            >
              {label}
              {key && !PUBLISH_HORIZONS.includes(key as never) && (
                <span className="ml-1 text-[10px] text-text-mute">탐색용</span>
              )}
            </Link>
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
          {activeHorizon && <input type="hidden" name="horizon" value={activeHorizon} />}
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

      {/* 셋업별 섹션 — 기본 화면.
          섹션마다 «카드»로 가른다(2026-08-23 Victor — "각 섹션 별로 구분된 모습이
          나타나면 좋겠어"). 예전에는 밑줄 하나로만 갈라서 일곱 덩어리가 한 장처럼
          흘렀고, 0건 섹션이 125건 섹션과 같은 무게로 자리를 먹었다.
          숫자 열에 머리글을 단다 — 예전에는 104,100 / 99,584 / 0.80 이 라벨 없이
          나란히 있어 어느 게 진입가고 어느 게 손절가인지 알 수 없었다. */}
      {sectionView ? (
        <div className="flex flex-col gap-4">
          {ALL_SETUPS.map(({ key, label }) => {
            const rows = bySetupRows.get(key) ?? [];
            const cnt = setupCounts.get(key) ?? 0;
            return (
              <section
                key={key}
                className="overflow-hidden rounded-[12px] border border-border bg-surface"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border bg-surface-2 px-4 py-2.5">
                  <h2 className="flex items-baseline gap-2 text-sm font-bold text-text">
                    {label}
                    <span className="tnum text-[11px] font-medium text-text-mute">
                      {cnt}건
                    </span>
                  </h2>
                  <Link
                    href={`?setup=${key}`}
                    className="text-xs text-accent transition-colors hover:underline"
                  >
                    전체 보기 →
                  </Link>
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 py-4 text-[12px] text-text-mute">
                    오늘 이 셋업의 시그널은 없습니다.
                  </p>
                ) : (
                  <div className="no-scrollbar overflow-x-auto px-4">
                    {/* 항목 머리 — 아래 행과 같은 그리드를 써야 열이 맞는다. */}
                    <div className="grid min-w-[660px] grid-cols-[minmax(140px,2fr)_6.5rem_minmax(110px,1.4fr)_minmax(130px,1.6fr)_3.5rem_3rem] items-baseline gap-3 border-b border-border-soft py-2 text-[10px] text-text-mute">
                      <span>종목</span>
                      <span>기간</span>
                      <span className="text-right">현재가</span>
                      <span className="text-right">진입가</span>
                      <span className="text-right">손절가</span>
                      <span className="text-right">합성알파</span>
                    </div>
                    <div className="divide-y divide-border-soft">
                    {rows.map((r) => {
                      const px = sectionPrices.get(r.symbol);
                      return (
                        // stretched link — 행 전체를 누를 수 있게 하되 링크 안에
                        // 버튼(종목코드 복사)을 넣지 않는다. 링크는 종목명에만 걸고
                        // ::after 로 행을 덮는다(마크업 유효 · 스크린리더 정상).
                        <div
                          key={r.id}
                          className="relative grid min-w-[660px] grid-cols-[minmax(140px,2fr)_6.5rem_minmax(110px,1.4fr)_minmax(130px,1.6fr)_3.5rem_3rem] items-center gap-3 py-3 transition-colors hover:bg-surface-2"
                        >
                          <span className="flex min-w-0 items-baseline gap-2">
                            <Link
                              href={`/stocks/${r.symbol}`}
                              className="truncate text-[13px] font-semibold text-text after:absolute after:inset-0 after:content-[''] hover:text-accent"
                            >
                              {r.name}
                            </Link>
                            <SymbolCode
                              symbol={r.symbol}
                              className="relative z-10 shrink-0 text-[10px] text-text-mute"
                            />
                          </span>
                          {/* 기간 — "언제까지 들고 있나"를 목록에서 바로 본다.
                              이 기간이 지나면 엔진이 종가로 자동 청산한다.
                              스타일 이름(스윙·포지션)은 쓰지 않는다 — 축은 기간 하나다. */}
                          <span className="flex flex-col leading-tight">
                            <span className="text-[10px] text-text-mute">
                              {horizonLabel(r.horizon)
                                ? `${horizonLabel(r.horizon)} · ${holdingLabel(r.horizon, r.style)}`
                                : holdingLabel(r.horizon, r.style)}
                            </span>
                            {!isVerified(r.setup, r.horizon, r.style) && (
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
                          {/* 「진입 → 목표」 화살표를 버렸다(2026-08-23). 목표에서 팔지
                              않는데 화살표를 그으면 «저기까지 간다»로 읽힌다. 진입과
                              손절만 적는다 — 확정된 건 거는 돈뿐이다. */}
                          <span className="tnum text-right text-[12px] text-text-dim">
                            {fmtPrice(r.entry_price)}
                          </span>
                          <span className="tnum text-right text-[11px] text-bad">
                            {fmtPrice(r.stop_loss)}
                          </span>
                          <span className="tnum text-right text-[13px] font-bold text-text">
                            {fmtNum(r.strength, 2)}
                          </span>
                        </div>
                      );
                    })}
                    </div>
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
          {/* ── 폰 (768 미만) — 시그널 하나가 카드 한 장 ──
              열이 12개다. 표로 두면 진입가부터가 스크롤 뒤로 숨는데, 이 화면은 «지금 살
              만한가»를 훑는 곳이라 레벨과 판정이 먼저 보여야 한다. 스파크바·1주당 리스크는
              카드에서 뺐다 — 좁은 화면에서 다 넣으면 어느 것도 안 읽힌다. */}
          <div className="md:hidden">
            {visible.map((s) => {
              const slPct =
                s.stop_loss != null && s.entry_price
                  ? (s.stop_loss - s.entry_price) / s.entry_price
                  : null;
              const tpPct =
                s.tp1 != null && s.entry_price ? (s.tp1 - s.entry_price) / s.entry_price : null;
              return (
                <article key={`m-${s.id}`} className="border-b border-border px-4 py-3.5 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent">
                        {initials(s.name)}
                      </span>
                      <div className="min-w-0">
                        <Link href={`/stocks/${s.symbol}`} className="block text-[15px] font-bold text-text">
                          {s.name}
                        </Link>
                        <SymbolCode symbol={s.symbol} className="text-[12px] text-text-mute" />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11.5px] text-text-mute">현재가</p>
                      <p className="mono text-[15px] font-bold text-text">
                        {priceMap.get(s.symbol) ? fmtPrice(priceMap.get(s.symbol)!.close) : "—"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-mute">
                    <span>
                      {s.setup
                        ? TRADE_SETUP_LABELS[s.setup as keyof typeof TRADE_SETUP_LABELS] ?? s.setup
                        : "셋업 미상"}
                    </span>
                    <span className="opacity-40">·</span>
                    <span>{horizonLabel(s.horizon)}</span>
                    <span className="opacity-40">·</span>
                    <span className="tnum">합성알파 {fmtNum(s.strength, 2)}</span>
                  </p>

                  <dl className="mono mt-2.5 flex flex-wrap gap-x-4 gap-y-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[12.5px]">
                    <span>
                      <dt className="inline text-text-mute">진입 </dt>
                      <dd className="inline font-semibold text-text">{fmtPrice(s.entry_price)}</dd>
                    </span>
                    <span>
                      <dt className="inline text-text-mute">손절 </dt>
                      <dd className="inline font-semibold text-bad">
                        {fmtPrice(s.stop_loss)}
                        {slPct != null && <span className="ml-1 font-normal">{fmtPct(slPct)}</span>}
                      </dd>
                    </span>
                    <span>
                      <dt className="inline text-text-mute">본전 </dt>
                      <dd className="inline font-semibold text-good">
                        {fmtPrice(s.tp1)}
                        {tpPct != null && <span className="ml-1 font-normal">{fmtPct(tpPct)}</span>}
                      </dd>
                    </span>
                  </dl>

                  <div className="mt-2">
                    <AiJudge signal={s} />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  {[
                    "종목",
                    "셋업",
                    "기간",
                    "신호일",
                    "현재가",
                    "진입가",
                    "손절가",
                    // 「목표가」·「R:R」을 버렸다(2026-08-23). 채택 규칙(trail)은 목표에서
                    // 팔지 않는다 — 닿으면 손절만 진입가로 올린다. 홈·오늘의 픽과 같은 말로.
                    "본전 도달가",
                    "1주당 리스크",
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
                  const riskPerShare =
                    s.entry_price != null && s.stop_loss != null
                      ? s.entry_price - s.stop_loss
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
                            <SymbolCode symbol={s.symbol} className="text-[10px] text-text-mute" />
                          </div>
                        </div>
                      </td>

                      {/* 셋업 */}
                      <td className="px-3 py-3">
                        <SetupPill setup={s.setup} />
                      </td>

                      {/* 기간 — "언제까지 들고 있나"에 화면이 답해야 한다.
                          엔진이 이 기간이 지나면 종가로 자동 청산한다.
                          스타일 열은 없앴다 — 축은 기간 하나다. */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {horizonLabel(s.horizon) && (
                          <span className="mr-1 rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                            {horizonLabel(s.horizon)}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-text-dim">
                          {holdingLabel(s.horizon, s.style)}
                        </span>
                        {holdingApprox(s.horizon, s.style) && (
                          <span className="ml-1 text-[10px] text-text-mute">
                            {holdingApprox(s.horizon, s.style)}
                          </span>
                        )}
                        {!isVerified(s.setup, s.horizon, s.style) && (
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

                      {/* 손절가 — 본전 도달가보다 앞에 둔다. 잃는 쪽을 먼저 읽게. */}
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

                      {/* 본전 도달가 — 파는 값이 아니다. 닿으면 손절이 진입가로 올라간다. */}
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

                      {/* 1주당 리스크 = 진입가 − 손절가. 실제로 거는 돈이다. */}
                      <td className="mono px-3 py-3 text-[13px] font-semibold text-text-dim">
                        {riskPerShare != null
                          ? `${Math.round(riskPerShare).toLocaleString("ko-KR")}원`
                          : "—"}
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
