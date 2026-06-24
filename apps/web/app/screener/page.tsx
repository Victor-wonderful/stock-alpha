import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SampleBadge } from "@/components/ui";
import { Crosshair, TrendingUp } from "lucide-react";
import { getSignals } from "@/lib/data";
import { fmtPrice, fmtPct, fmtNum } from "@/lib/format";
import type { SignalView } from "@/lib/types";

export const dynamic = "force-dynamic";

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
    <span className="inline-flex items-center rounded-[6px] bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/25 whitespace-nowrap">
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
    <span className="inline-flex items-center rounded-[6px] bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-inset ring-sky-500/25 whitespace-nowrap">
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

  // 셋업 칩 건수·하이라이트 집계가 전체 기준이어야 함 — 오늘만 271건이라 200 한도는 잘림(2026-06-12 점검)
  const { data: allSignals, isSample, total } = await getSignals({}, 1000);

  // 셋업별 건수 집계 (필터 전 전체 기준)
  const setupCounts = new Map<string, number>();
  for (const s of allSignals) {
    setupCounts.set(s.setup, (setupCounts.get(s.setup) ?? 0) + 1);
  }

  // 필터 적용
  let filtered = allSignals;
  if (activeSetup) filtered = filtered.filter((s) => s.setup === activeSetup);
  if (activeStyle) filtered = filtered.filter((s) => s.style === activeStyle);
  if (activeMarket) filtered = filtered.filter((s) => s.exchange === activeMarket);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (s) => s.name.toLowerCase().includes(q) || s.symbol.includes(q),
    );
  }

  const hl = computeHighlights(allSignals);

  const buildHref = (key: string, value: string | null) => {
    const p = new URLSearchParams();
    if (activeSetup && key !== "setup") p.set("setup", activeSetup);
    if (activeStyle && key !== "style") p.set("style", activeStyle);
    if (activeMarket && key !== "market") p.set("market", activeMarket);
    if (search) p.set("q", search);
    if (value) p.set(key, value);
    const qs = p.toString();
    return qs ? `?${qs}` : "/screener";
  };

  // 게이트 통과·발행 중인 셋업만(유령 필터 금지). ScreenerFilters.ACTIVE_SETUPS 와 동일 기준.
  const ALL_SETUPS: Array<{ key: string; label: string }> = [
    { key: "leader_trend", label: "주도주 추세" },
    { key: "flow_accumulation", label: "수급 매집" },
    { key: "pullback", label: "눌림목" },
    { key: "breakout", label: "돌파" },
    { key: "high_52w", label: "52주 신고가" },
    { key: "vol_squeeze", label: "변동성 수축" },
    { key: "pead", label: "실적 서프라이즈" },
  ];

  return (
    <AppShell
      title="스크리너"
      subtitle={`발행 중 전체 시그널 ${total ?? allSignals.length}건을 조건으로 탐색 — 백테스트 게이트 통과 셋업만 발행 · 클릭하면 종목 상세로 · 매일 16:30 갱신`}
      badge={
        <span className="flex items-center gap-1.5 rounded-[999px] bg-good-soft px-3 py-1 text-[11px] font-bold text-good">
          검증 통과 셋업만 — 미통과 발행 금지
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
          { label: "오늘 신규 시그널", value: `${hl.today}건`, sub: "백테스트 게이트 통과" },
          { label: "최다 셋업", value: hl.topSetup ? SETUP_LABELS[hl.topSetup[0]] ?? hl.topSetup[0] : "—", sub: hl.topSetup ? `${hl.topSetup[1]}건` : "" },
          { label: "최고 합성알파", value: fmtNum(hl.topAlpha, 2), sub: "강도 기준" },
          { label: "평균 손익비", value: hl.avgRr != null ? `${fmtNum(hl.avgRr, 1)} R:R` : "—", sub: "전략 평균" },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="rounded-[20px] border border-border bg-surface p-4"
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
          href="/alpha-zone"
          className="flex items-center gap-1.5 rounded-[999px] border border-border bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-text transition-colors hover:border-accent"
        >
          <Crosshair className="h-3.5 w-3.5 text-accent" /> 진입 가능
          <span className="font-medium text-text-mute">현재가가 진입가 부근</span>
        </Link>
        <Link
          href={buildHref("setup", "flow_accumulation")}
          className={`flex items-center gap-1.5 rounded-[999px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            activeSetup === "flow_accumulation"
              ? "border-accent bg-accent text-[#0B0C10]"
              : "border-border bg-surface-2 text-text hover:border-accent"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5 text-accent" /> 수급
          <span
            className={`font-medium ${activeSetup === "flow_accumulation" ? "text-[#0B0C10]/70" : "text-text-mute"}`}
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
              ? "bg-accent text-[#0B0C10]"
              : "border border-border bg-surface text-text-dim hover:border-border-strong hover:text-text"
          }`}
        >
          전체 {allSignals.length}
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
                  ? "bg-accent text-[#0B0C10]"
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

      {/* 시그널 테이블 */}
      {filtered.length === 0 ? (
        <div className="rounded-[20px] border border-border bg-surface px-6 py-12 text-center">
          <p className="text-sm text-text-mute">조건에 맞는 시그널이 없습니다. 필터를 바꿔보세요.</p>
        </div>
      ) : (
        <div className="rounded-[20px] border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  {[
                    "종목",
                    "셋업",
                    "스타일",
                    "신호일",
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
                {filtered.map((s) => {
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
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
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

                      {/* 신호일 */}
                      <td className="mono px-3 py-3 text-[11px] text-text-mute">
                        {dateStr}
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
                          <span className="ml-1 text-[10px] text-good/70">
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
