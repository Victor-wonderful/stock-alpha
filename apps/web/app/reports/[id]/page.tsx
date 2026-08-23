import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { getLatestPrice, getPickHistory, getReportById, getUserRiskPct } from "@/lib/data";
import { fmtDateTime, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { computePositionSizePct } from "@/lib/position";
import { SymbolCode } from "@/components/SymbolCode";
import { horizonLabel, horizonSpec, PUBLISH_HORIZONS } from "@/lib/holding";
import { TRADE_SETUP_LABELS } from "@stock-alpha/db";
import type { ReportPlanRow } from "@/lib/types";
import { ReportDetailClient } from "./_client";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

const DISCLAIMER =
  "본 자료는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고 정보이며, 특정 개인에 대한 맞춤형 투자자문이 아닙니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다. 과거 성과(백테스트 포함)는 미래 수익을 보장하지 않습니다.";

function eokwon(v: number | null): string {
  return v == null ? "—" : `${(v / 1e8).toFixed(1)}억원`;
}

function planStatus(
  row: ReportPlanRow,
  last: number | null,
): { label: string; variant: "bull" | "bear" | "warn" | "neutral" } {
  if (row.valid_until && new Date(row.valid_until).getTime() < Date.now()) {
    return { label: "만료", variant: "neutral" };
  }
  if (last == null) return { label: "—", variant: "neutral" };
  if (row.stop_loss != null && last <= row.stop_loss) {
    return { label: "무효 · 손절가 하회", variant: "bear" };
  }
  if (last > row.entry_price * 1.05) {
    return { label: "무효 · 진입가 이탈", variant: "bear" };
  }
  if (Math.abs(last - row.entry_price) / row.entry_price <= 0.02) {
    return { label: "진입권", variant: "bull" };
  }
  return { label: "진입 대기", variant: "warn" };
}

/**
 * 레벨이 같은 플랜을 한 줄로 묶는다.
 *
 * 왜 같은 값이 여러 줄로 나왔나(2026-08-23 Victor) — 진입·손절·본전은 **셋업이 아니라
 * 기간 프로파일**(ATR × 기간)로 계산한다. 그래서 한 종목의 같은 기간 셋업들은 레벨이
 * 전부 같다. 실제 화면: 「주도주 추세」와 「눌림목」이 진입 104,100 / 손절 99,584 /
 * 본전 115,391 / 리스크 4,516원 / 비중 23.1% 로 완전히 같은 카드 두 장이었다.
 * 다른 건 셋업 이름과 근거 문장뿐이라 그 둘만 묶어서 보여준다.
 *
 * 만료·무효는 뒤로 내린다(그 안에서는 발행 순서 유지).
 */
function groupPlans(plan: ReportPlanRow[], last: number | null) {
  const out: {
    row: ReportPlanRow;
    setups: string[];
    rationales: string[];
    status: ReturnType<typeof planStatus>;
  }[] = [];
  const byKey = new Map<string, (typeof out)[number]>();
  for (const row of plan) {
    const status = planStatus(row, last);
    // 상태까지 키에 넣는다 — 하나는 살아 있고 하나는 만료라면 같은 줄이 아니다.
    const key = [row.horizon ?? row.style, row.entry_price, row.stop_loss, row.tp1, status.label]
      .join("|");
    const hit = byKey.get(key);
    if (hit) {
      if (!hit.setups.includes(row.setup)) hit.setups.push(row.setup);
      if (row.rationale) hit.rationales.push(row.rationale);
      continue;
    }
    const entry = {
      row,
      setups: [row.setup as string],
      rationales: row.rationale ? [row.rationale] : [],
      status,
    };
    byKey.set(key, entry);
    out.push(entry);
  }
  return out.sort(
    (a, b) => Number(isDeadPlan(a.status.label)) - Number(isDeadPlan(b.status.label)),
  );
}

/** 더는 실행할 수 없는 플랜인가 — 만료·무효. 화면에서 뒤로 내리고 흐리게 둔다. */
function isDeadPlan(label: string): boolean {
  return label === "만료" || label.startsWith("무효");
}

const FACTOR_LABELS: Record<string, string> = {
  value_z: "밸류",
  quality_z: "퀄리티",
  momentum_z: "모멘텀",
  growth_z: "성장",
  lowvol_z: "저변동",
  size_z: "사이즈",
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: report } = await getReportById(Number(id));
  if (!report || !report.payload) notFound();

  const p = report.payload;
  const n = p.narrative;
  const latest = await getLatestPrice(p.instrument.id);
  const lastNow = latest.data?.close ?? null;
  const riskPct = await getUserRiskPct();

  // 픽 여부 확인 (오늘의 픽 배지) — 이 리포트의 as_of 까지 커버되게 충분히 조회
  // (60이면 12일치뿐 — 과거 리포트에서 배지가 조용히 누락되던 패턴, 2026-06-12 점검)
  const { data: history } = await getPickHistory(500);
  const isPick = history.some(
    (h) => h.symbol === p.instrument.symbol && h.as_of === report.as_of,
  );

  // 게이트 통과 건수
  const gatePassed = p.tradability.checks.filter((c) => c.passed).length;
  const gateTotal = p.tradability.checks.length;

  // 팩터 z-score 배열
  const factorBars: { label: string; value: number }[] = p.factor
    ? (
        [
          ["value_z", p.factor.value_z],
          ["quality_z", p.factor.quality_z],
          ["momentum_z", p.factor.momentum_z],
          ["growth_z", p.factor.growth_z],
          ["lowvol_z", p.factor.lowvol_z],
          ["size_z", p.factor.size_z],
        ] as [string, number | null][]
      )
        .filter(([, v]) => v != null)
        .map(([k, v]) => ({ label: FACTOR_LABELS[k] ?? k, value: v as number }))
    : [];

  const maxZ = Math.max(...factorBars.map((f) => Math.abs(f.value)), 1);

  return (
    <AppShell
      title={`${p.instrument.name} 리포트`}
      subtitle={`${p.instrument.symbol} · 발행 ${fmtDateTime(report.created_at)}`}
      hideHeader
    >
      {/* 브레드크럼 + 메타 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/reports"
          className="flex items-center gap-1 text-xs font-semibold text-text-dim hover:text-accent"
        >
          ← 종목 분석으로
        </Link>
        <span className="text-[10px] text-text-mute">
          수치는 전부 DB 근거(source_refs) — LLM은 서술만 · {fmtDateTime(report.created_at)} 발행
        </span>
      </div>

      {/* 히어로 카드 — 네이비(2026-08-23 Victor). 종목 상세의 「AI 애널리스트 리포트」
          패널과 같은 색이다: 그 패널을 눌러 여기로 오므로 색이 이어져야 «같은 것의
          안쪽»으로 읽힌다. 이 카드에 실린 값(판정·점수·가중치·근거 문장)이 전부
          엔진 산출이라 색 규칙 «네이비 = 기계가 낸 데이터»에도 맞는다.
          네이비 위에서는 라이트 바탕용 색이 묻히므로 안쪽을 전부 on-navy 계열로. */}
      <div className="mb-5 rounded-[12px] bg-navy p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-xl font-extrabold text-on-navy">{p.instrument.name}</h1>
              <SymbolCode symbol={p.instrument.symbol} className="text-xs text-on-navy-3" />
              {/* 판정 배지 — 밝은 바탕 + 네이비 글자로 뒤집는다(라이트용은 대비 2점대). */}
              <span
                className={`rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${
                  p.verdict.rating === "매수"
                    ? "bg-up-on-navy text-navy"
                    : p.verdict.rating === "거래 부적합"
                      ? "bg-down-on-navy text-navy"
                      : "bg-on-navy/15 text-on-navy"
                }`}
              >
                {p.verdict.rating}
              </span>
              {isPick && (
                <span className="rounded-[6px] bg-accent-on-navy px-2 py-0.5 text-[10px] font-bold text-navy">
                  ⭐ 오늘의 픽
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-on-navy-2 max-w-2xl">
              {n.thesis}
            </p>
            {n.risks.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-warn-on-navy/15 px-3 py-2.5">
                <TriangleAlert
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn-on-navy"
                  strokeWidth={2}
                />
                <p className="text-xs leading-relaxed text-on-navy-2">
                  <span className="font-bold text-warn-on-navy">최우선 리스크</span> — {n.risks[0]}
                </p>
              </div>
            )}
          </div>
          {/* 대형 점수 */}
          <div className="shrink-0 text-right">
            <p className="tnum text-5xl font-extrabold text-accent-on-navy leading-none">
              {p.verdict.score}
            </p>
            <p className="text-[11px] text-on-navy-3 mt-1">/100점</p>
            <p className="text-[10px] text-on-navy-3 mt-0.5">
              팩터 {p.verdict.weights.factor} · 밸류 {p.verdict.weights.valuation} · 시그널 {p.verdict.weights.signal} 가중
            </p>
          </div>
        </div>
      </div>

      {/* 2컬럼 레이아웃 */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* 좌측 본문 */}
        <div className="space-y-4">
          {/* 실행 플랜 카드 */}
          <div className="rounded-[12px] border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[13px] font-bold">
                <span className="h-3.5 w-0.5 rounded-full bg-border-strong" aria-hidden />
                실행 플랜
              </h2>
              {/* 「현재가 기준 판정」이라 적어 놓고 정작 현재가가 화면에 없었다
                  (2026-08-23 Victor). 「진입권」이 왜 진입권인지 대조할 값이 없으면
                  배지는 근거 없는 라벨이 된다. */}
              <span className="flex items-baseline gap-1.5 text-[10px] text-text-mute">
                현재가
                <span className="tnum text-[12px] font-bold text-text">
                  {lastNow != null ? fmtPrice(lastNow) : "—"}
                </span>
                기준 실시간 판정
              </span>
            </div>

            {p.plan.length === 0 ? (
              <p className="text-sm text-text-mute">현재 발행된 매수 셋업이 없습니다.</p>
            ) : (
              <>
                {/* 이 목록은 «순서»가 아니라 «대안»이다(2026-08-23 Victor — 헷갈린다).
                    같은 종목에서 서로 다른 셋업이 각자의 진입·손절을 낸 것이라, 진입가가
                    같아도 손절가가 다르다. 위에서 아래로 실행하는 단계로 읽히면 안 된다.
                    살아 있는 플랜을 위로 올리고 만료는 아래로 내린다 — 예전에는 발행
                    순서대로 나와서 만료 3개가 살아 있는 1개보다 위에 서 있었다. */}
                <p className="mb-3 text-[11px] leading-relaxed text-text-mute">
                  같은 종목에서 셋업마다 따로 계산한 <span className="font-semibold text-text-dim">대안</span>입니다
                  — 위에서 아래로 실행하는 단계가 아닙니다.{" "}
                  <span className="text-text-dim">
                    같은 기간이면 진입·손절이 같습니다(레벨은 셋업이 아니라 기간 프로파일로
                    계산합니다) — 그런 줄은 셋업만 묶어 한 줄로 보여줍니다.
                  </span>
                </p>
                {groupPlans(p.plan, lastNow).map(({ row, setups, rationales, status }, i) => {
                  const dead = isDeadPlan(status.label);
                  const sz = computePositionSizePct(row.entry_price, row.stop_loss, riskPct);
                  const tpPct =
                    row.tp1 != null ? ((row.tp1 - row.entry_price) / row.entry_price) * 100 : null;
                  const slPct =
                    row.stop_loss != null
                      ? ((row.stop_loss - row.entry_price) / row.entry_price) * 100
                      : null;
                  return (
                    <div
                      key={i}
                      className={`mb-3 last:mb-0 rounded-[12px] border p-4 ${
                        dead
                          ? "border-border-soft bg-surface opacity-60"
                          : "border-border bg-surface-2"
                      }`}
                    >
                      {/* 기간 + 셋업 + 상태 — 영문 키(position·markov)가 그대로 노출되고
                          있었다(2026-08-23 Victor). 축은 기간 하나이고, 이름표는
                          packages/db 의 TRADE_SETUP_LABELS 하나만 쓴다. */}
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {horizonLabel(row.horizon) && (
                          <span className="rounded-[6px] bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                            {horizonLabel(row.horizon)}
                            {horizonSpec(row.horizon) ? ` · ${horizonSpec(row.horizon)!.bars}거래일` : ""}
                          </span>
                        )}
                        {/* 쉬는 기간의 플랜은 계산은 돼도 「오늘의 픽」으로 나가지 않는다.
                            안 적으면 「장기 · 진입권」을 보고 사도 되는 줄로 읽는다 —
                            분석에서 본 플랜이 왜 픽에 없는지 여기서 답해야 한다. */}
                        {row.horizon && !PUBLISH_HORIZONS.includes(row.horizon as never) && (
                          <span className="rounded-[6px] bg-surface-3 px-2 py-0.5 text-[10px] font-semibold text-text-mute">
                            픽으로 발행 안 함
                          </span>
                        )}
                        {setups.map((st) => (
                          <span
                            key={st}
                            className="rounded-[6px] bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-inset ring-violet-500/25"
                          >
                            {TRADE_SETUP_LABELS[st as keyof typeof TRADE_SETUP_LABELS] ?? st}
                          </span>
                        ))}
                        <Badge variant={status.variant} size="sm">{status.label}</Badge>
                      </div>

                      {/* 5분할 수치 — 홈·오늘의 픽·스크리너·종목 상세와 같은 이름·같은
                          순서(2026-08-23). 「목표가」·「R:R」을 버렸다: 채택 규칙(trail)은
                          목표에서 팔지 않고 손절만 진입가로 올린다. 잃는 쪽을 먼저 읽게 두고,
                          마지막 칸에는 실제로 거는 돈(1주당 리스크)을 놓는다. */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {[
                          {
                            label: "진입가",
                            value: fmtPrice(row.entry_price),
                            sub: "발행 기준",
                            tone: "text-text",
                          },
                          {
                            label: "손절가",
                            value: fmtPrice(row.stop_loss),
                            sub: slPct != null ? `${slPct.toFixed(1)}%` : "",
                            tone: "text-bad",
                          },
                          {
                            label: "본전 도달가",
                            value: fmtPrice(row.tp1),
                            sub: tpPct != null ? `+${tpPct.toFixed(1)}% · 손절이 본전으로` : "손절이 본전으로",
                            tone: "text-good",
                          },
                          {
                            label: "1주당 리스크",
                            value:
                              row.entry_price != null && row.stop_loss != null
                                ? `${Math.round(row.entry_price - row.stop_loss).toLocaleString("ko-KR")}원`
                                : "—",
                            sub: "진입 − 손절",
                            tone: "text-text-dim",
                          },
                          {
                            label: "권장 비중",
                            value: sz != null ? `${sz.toFixed(1)}%` : "—",
                            sub: `계좌 리스크 ${riskPct}%`,
                            tone: "text-accent",
                          },
                        ].map(({ label, value, sub, tone }) => (
                          <div key={label} className="rounded-[8px] bg-surface-3 px-3 py-2.5">
                            <p className="text-[10px] text-text-mute">{label}</p>
                            <p className={`tnum mt-0.5 text-[17px] font-extrabold ${tone}`}>
                              {value}
                            </p>
                            {sub && <p className="mt-0.5 text-[10px] text-text-mute">{sub}</p>}
                          </div>
                        ))}
                      </div>

                      {/* 근거는 셋업마다 다르다 — 레벨이 같아 한 줄로 묶었어도 «왜»는
                          각각 적는다. 묶기 전에는 이 줄 하나 때문에 같은 카드가 여럿
                          늘어서 있었다. */}
                      {rationales.length > 0 && (
                        <ul className="mt-2.5 space-y-1">
                          {rationales.map((rt, k) => (
                            <li key={k} className="text-[11px] leading-relaxed text-text-mute">
                              {setups.length > 1 && (
                                <span className="mr-1 font-semibold text-text-dim">
                                  {TRADE_SETUP_LABELS[setups[k] as keyof typeof TRADE_SETUP_LABELS] ??
                                    setups[k]}
                                </span>
                              )}
                              {rt}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                <p className="mt-2 text-[10px] text-text-mute">
                  플랜 유효 · 비중 읽기시점 재계산 — 손절 도달 시 권장 비중 0으로 자동 처리
                </p>
              </>
            )}
          </div>

          {/* 근거 카드 — 트레이더 관점 펼침 + 퀀트/밸류 접힘 */}
          <ReportDetailClient narrative={n} />

          {/* 면책 박스 */}
          <div className="rounded-[12px] border border-border bg-surface-2 px-4 py-3">
            <p className="text-[10px] leading-relaxed text-text-mute">{DISCLAIMER}</p>
          </div>
        </div>

        {/* 우측 레일 */}
        <div className="space-y-4">
          {/* 거래 가능 게이트 */}
          <div className="rounded-[12px] border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-bold">거래 가능 게이트</h2>
              <span
                className={`rounded-[999px] px-2.5 py-1 text-[10px] font-bold ${
                  p.tradability.passed
                    ? "bg-pass-soft text-pass"
                    : "bg-fail-soft text-fail"
                }`}
              >
                {gatePassed}/{gateTotal} 통과
              </span>
            </div>
            <ul className="space-y-2">
              {p.tradability.checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-10 shrink-0 rounded py-0.5 text-center text-[10px] font-bold ${
                      c.passed ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail"
                    }`}
                  >
                    {c.passed ? "PASS" : "FAIL"}
                  </span>
                  <span className="flex-1 text-text-dim">{c.label}</span>
                  {typeof c.value === "number" && (
                    <span className="tnum shrink-0 text-[10px] text-text-mute">
                      {c.key === "liquidity" ? eokwon(c.value) : fmtNum(c.value, 3)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* 퀀트 핵심 수치 */}
          <div className="rounded-[12px] border border-border bg-surface p-4">
            <h2 className="mb-3 text-[13px] font-bold">퀀트 핵심 수치</h2>
            {/* 6셀 그리드 */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  ["PER", p.valuation?.per != null ? `${fmtNum(p.valuation.per, 1)}배` : null, "text-warn"],
                  ["PBR", p.valuation?.pbr != null ? `${fmtNum(p.valuation.pbr, 1)}배` : null, "text-warn"],
                  ["ROE", p.valuation?.roe != null ? fmtPct(p.valuation.roe) : null, "text-text"],
                  ["합성알파", p.factor?.composite_alpha != null ? fmtNum(p.factor.composite_alpha, 3) : null, "text-text"],
                  ["DCF 적정가", p.valuation?.dcf_value != null ? fmtPrice(p.valuation.dcf_value) : null, "text-text"],
                  [
                    "업사이드",
                    p.valuation?.upside_pct != null ? fmtPct(p.valuation.upside_pct / 100) : null,
                    (p.valuation?.upside_pct ?? 0) >= 0 ? "text-good" : "text-bad",
                  ],
                ] as [string, string | null, string][]
              )
                .map(([label, value, color]) => (
                  <div key={label} className="rounded-[8px] bg-surface-2 px-3 py-2">
                    <p className="text-[10px] text-text-mute">{label}</p>
                    <p className={`tnum mt-0.5 text-[13px] font-bold ${color}`}>{value ?? "—"}</p>
                  </div>
                ))}
            </div>

            {/* 6팩터 z-score 바 */}
            {factorBars.length > 0 && (
              <div className="space-y-1.5 border-t border-border pt-3">
                {factorBars.map(({ label, value }) => {
                  const pct = Math.round((Math.abs(value) / maxZ) * 50);
                  const positive = value >= 0;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[10px] text-text-mute">{label}</span>
                      <div className="relative h-2 flex-1 rounded-full bg-surface-3">
                        <div className="absolute left-1/2 top-0 h-2 w-px bg-border-strong" />
                        <div
                          className={`absolute top-0 h-2 rounded-full ${positive ? "bg-good" : "bg-bad"}`}
                          style={
                            positive
                              ? { left: "50%", width: `${pct}%` }
                              : { right: "50%", width: `${pct}%` }
                          }
                        />
                      </div>
                      <span
                        className={`tnum w-8 shrink-0 text-right text-[10px] font-semibold ${positive ? "text-good" : "text-bad"}`}
                      >
                        {value > 0 ? "+" : ""}{fmtNum(value, 1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 수급 10일 */}
          {p.flows && (
            <div className="rounded-[12px] border border-border bg-surface p-4">
              <h2 className="mb-3 text-[13px] font-bold">수급 {p.flows.window_days}일</h2>
              <div className="space-y-2">
                {[
                  { label: "외국인 순매매", value: p.flows.foreign_net },
                  { label: "기관 순매매", value: p.flows.inst_net },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-text-mute">{label}</span>
                    <span
                      className={`tnum font-bold ${(value ?? 0) >= 0 ? "text-good" : "text-bad"}`}
                    >
                      {eokwon(value ?? null)}
                    </span>
                  </div>
                ))}
                {p.flows.last_date && (
                  <p className="text-[10px] text-text-mute">{p.flows.last_date} 기준</p>
                )}
              </div>
            </div>
          )}

          {/* source_refs 출처 노트 */}
          <div className="rounded-[12px] bg-surface-2 p-4">
            <p className="text-[11px] font-bold text-text-dim">출처 · 정직성 선언</p>
            <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-text-mute">
              <p>수치 근거 {report.source_refs?.length ?? 0}건 추적 (source_refs)</p>
              <p>발행 {fmtDateTime(report.created_at)} · 일일 자동 배치</p>
              <p>{report.model_version ?? "—"}</p>
            </div>
            <Link
              href="/reports"
              className="mt-2 inline-block text-[11px] font-semibold text-accent hover:underline"
            >
              ← 리포트 목록
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
