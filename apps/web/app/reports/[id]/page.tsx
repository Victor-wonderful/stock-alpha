import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { getLatestPrice, getPickHistory, getReportById, getUserRiskPct } from "@/lib/data";
import { fmtDateTime, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { computePositionSizePct } from "@/lib/position";
import type { ReportPlanRow } from "@/lib/types";
import { ReportDetailClient } from "./_client";

export const dynamic = "force-dynamic";

const DISCLAIMER =
  "본 자료는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고 정보이며, 특정 개인에 대한 맞춤형 투자자문이 아닙니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다. 과거 성과(백테스트 포함)는 미래 수익을 보장하지 않습니다.";

function ratingTone(rating: string) {
  if (rating === "매수") return "bull" as const;
  if (rating === "거래 부적합") return "bear" as const;
  if (rating === "중립") return "warn" as const;
  return "neutral" as const;
}

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

  // 픽 여부 확인 (오늘의 픽 배지)
  const { data: history } = await getPickHistory(60);
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

      {/* 히어로 카드 (accent 테두리) */}
      <div className="mb-5 rounded-[20px] border border-accent/40 bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-xl font-extrabold text-text">{p.instrument.name}</h1>
              <span className="mono text-xs text-text-mute">{p.instrument.symbol}</span>
              <Badge variant={ratingTone(p.verdict.rating)} size="md">
                {p.verdict.rating}
              </Badge>
              {isPick && (
                <span className="rounded-[6px] bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                  ⭐ 오늘의 픽
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-text-dim max-w-2xl">
              {n.thesis}
            </p>
            {n.risks.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-warn-soft px-3 py-2.5">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" strokeWidth={2} />
                <p className="text-xs leading-relaxed text-text-dim">
                  <span className="font-bold text-warn">최우선 리스크</span> — {n.risks[0]}
                </p>
              </div>
            )}
          </div>
          {/* 대형 점수 */}
          <div className="shrink-0 text-right">
            <p className="tnum text-5xl font-extrabold text-accent leading-none">
              {p.verdict.score}
            </p>
            <p className="text-[11px] text-text-mute mt-1">/100점</p>
            <p className="text-[10px] text-text-mute mt-0.5">
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
          <div className="rounded-[20px] border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[13px] font-bold">
                <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
                실행 플랜
              </h2>
              <span className="text-[10px] text-text-mute">상태는 현재가 기준 실시간 판정</span>
            </div>

            {p.plan.length === 0 ? (
              <p className="text-sm text-text-mute">현재 발행된 매수 셋업이 없습니다.</p>
            ) : (
              <>
                {p.plan.map((row, i) => {
                  const sz = computePositionSizePct(row.entry_price, row.stop_loss, riskPct);
                  const status = planStatus(row, lastNow);
                  const tpPct =
                    row.tp1 != null ? ((row.tp1 - row.entry_price) / row.entry_price) * 100 : null;
                  const slPct =
                    row.stop_loss != null
                      ? ((row.stop_loss - row.entry_price) / row.entry_price) * 100
                      : null;
                  return (
                    <div
                      key={i}
                      className="mb-3 last:mb-0 rounded-[12px] border border-border bg-surface-2 p-4"
                    >
                      {/* 스타일 + 셋업 + 상태 */}
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-[6px] bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300 ring-1 ring-inset ring-sky-500/25">
                          {row.style}
                        </span>
                        <span className="rounded-[6px] bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/25">
                          {row.setup}
                        </span>
                        <Badge variant={status.variant} size="sm">{status.label}</Badge>
                      </div>

                      {/* 5분할 수치 */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {[
                          {
                            label: "진입가",
                            value: fmtPrice(row.entry_price),
                            sub: "발행 기준",
                            tone: "text-text",
                          },
                          {
                            label: "목표가",
                            value: fmtPrice(row.tp1),
                            sub: tpPct != null ? `+${tpPct.toFixed(1)}%` : "",
                            tone: "text-good",
                          },
                          {
                            label: "손절가",
                            value: fmtPrice(row.stop_loss),
                            sub: slPct != null ? `${slPct.toFixed(1)}%` : "",
                            tone: "text-bad",
                          },
                          {
                            label: "R:R",
                            value: row.risk_reward != null ? fmtNum(row.risk_reward, 1) : "—",
                            sub: "",
                            tone: "text-accent",
                          },
                          {
                            label: "권장 비중",
                            value: sz != null ? `${sz.toFixed(1)}%` : "—",
                            sub: "5분할 기준",
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

                      {row.rationale && (
                        <p className="mt-2.5 text-[11px] leading-relaxed text-text-mute">
                          {row.rationale}
                        </p>
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
          <div className="rounded-[20px] border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-bold">거래 가능 게이트</h2>
              <span
                className={`rounded-[999px] px-2.5 py-1 text-[10px] font-bold ${
                  p.tradability.passed
                    ? "bg-good-soft text-good"
                    : "bg-bad-soft text-bad"
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
                      c.passed ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
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
          <div className="rounded-[20px] border border-border bg-surface p-4">
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
            <div className="rounded-[20px] border border-border bg-surface p-4">
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
          <div className="rounded-[20px] bg-surface-2 p-4">
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
