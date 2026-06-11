import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartCandlestick, ChartNoAxesColumn, TriangleAlert } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { SetupChip, StyleChip } from "@/components/AxisChips";
import { Panel, Stat, StrengthBar } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getLatestPrice, getReportById, getUserRiskPct } from "@/lib/data";
import { fmtDateTime, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { computePositionSizePct } from "@/lib/position";
import type { ReportPlanRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const DISCLAIMER =
  "본 자료는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고 정보이며, 특정 개인에 대한 맞춤형 투자자문이 아닙니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다. 과거 성과(백테스트 포함)는 미래 수익을 보장하지 않습니다.";

function ratingTone(rating: string) {
  if (rating === "매수") return "bull" as const;
  if (rating === "거래 부적합") return "bear" as const;
  if (rating === "중립") return "warn" as const;
  return "default" as const;
}

function eokwon(v: number | null): string {
  return v == null ? "—" : `${(v / 1e8).toFixed(1)}억원`;
}

// 실행플랜 행의 "지금 유효한가" — 발행은 과거여도 판정은 읽는 시점 기준.
// 만료(valid_until 경과) > 무효(손절 하회/+5% 초과 추격) > 진입권(±2%) > 대기.
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

  return (
    <AppShell
      title={`${p.instrument.name} 종목 심층분석`}
      subtitle={`${p.instrument.symbol} · 발행 ${fmtDateTime(report.created_at)} · ${report.model_version ?? ""}`}
      badge={
        <Badge variant={ratingTone(p.verdict.rating) === "default" ? "neutral" : ratingTone(p.verdict.rating)} size="md">
          {p.verdict.rating}
        </Badge>
      }
    >
      {/* UI V2: 좌측 본문(①③④⑤) + 우측 레일(②게이트·퀀트 수치·메타) */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {/* ① 판정 */}
          <Panel title="① 판정 — 사야 하나">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="투자의견"
                value={p.verdict.rating}
                tone={ratingTone(p.verdict.rating)}
              />
              <Stat
                label="종합 점수"
                value={`${p.verdict.score}점`}
                sub="100점 만점"
                tone="warn"
              />
              <Stat label="현재가" value={`${fmtPrice(p.last_close)}원`} />
              <Stat
                label="1차 목표가"
                value={p.plan[0]?.tp1 != null ? `${fmtPrice(p.plan[0].tp1)}원` : "—"}
                tone="bull"
              />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-dim">{n.thesis}</p>
            <p className="mt-2 text-2xs text-text-mute">
              가중치 — 멀티팩터 {p.verdict.weights.factor} · 밸류에이션{" "}
              {p.verdict.weights.valuation} · 시그널 {p.verdict.weights.signal}
            </p>
          </Panel>

          {/* ③ 실행 플랜 */}
          <Panel
            title="③ 실행 플랜 — 얼마에 사고, 팔고, 손절하나"
            action={
              <span className="text-2xs text-text-mute">
                상태는 현재가 기준 실시간 판정
              </span>
            }
          >
            {p.plan.length === 0 ? (
              <p className="text-sm text-text-mute">
                현재 발행된 매수 셋업이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-2xs text-text-mute">
                      <th className="py-2 pl-3 text-left font-medium">스타일</th>
                      <th className="px-3 py-2 text-left font-medium">셋업</th>
                      <th className="px-3 py-2 text-right font-medium">진입가</th>
                      <th className="px-3 py-2 text-right font-medium">손절가</th>
                      <th className="px-3 py-2 text-right font-medium">TP1</th>
                      <th className="px-3 py-2 text-right font-medium">TP2</th>
                      <th className="px-3 py-2 text-right font-medium">R:R</th>
                      <th className="px-3 py-2 text-right font-medium">권장 비중</th>
                      <th className="px-3 py-2 text-left font-medium">신뢰도</th>
                      <th className="px-3 py-2 text-left font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.plan.map((row, i) => (
                      <tr
                        key={i}
                        className="border-t border-border hover:bg-surface-2"
                      >
                        <td className="py-2.5 pl-3">
                          <StyleChip style={row.style} />
                        </td>
                        <td className="px-3 py-2.5">
                          <SetupChip setup={row.setup} />
                        </td>
                        <td className="mono px-3 py-2.5 text-right font-semibold">
                          {fmtPrice(row.entry_price)}
                        </td>
                        <td className="mono px-3 py-2.5 text-right font-semibold text-bear">
                          {fmtPrice(row.stop_loss)}
                        </td>
                        <td className="mono px-3 py-2.5 text-right font-semibold text-bull">
                          {fmtPrice(row.tp1)}
                        </td>
                        <td className="mono px-3 py-2.5 text-right text-bull">
                          {fmtPrice(row.tp2)}
                        </td>
                        <td className="mono px-3 py-2.5 text-right">
                          {fmtNum(row.risk_reward, 2)}
                        </td>
                        <td className="mono px-3 py-2.5 text-right font-semibold text-accent">
                          {(() => {
                            const sz = computePositionSizePct(
                              row.entry_price,
                              row.stop_loss,
                              riskPct,
                            );
                            return sz != null ? `${sz.toFixed(1)}%` : "—";
                          })()}
                        </td>
                        <td className="px-3 py-2.5">
                          <StrengthBar value={row.strength} />
                        </td>
                        <td className="px-3 py-2.5">
                          {(() => {
                            const s = planStatus(row, lastNow);
                            return (
                              <Badge variant={s.variant} size="md">
                                {s.label}
                              </Badge>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* ④ 근거 — 두 관점 */}
          <Panel title="④ 근거">
            <div className="space-y-4">
              <div>
                <p className="flex items-center gap-1.5 text-[13px] font-bold">
                  <ChartCandlestick className="h-4 w-4 text-accent" strokeWidth={2} />
                  전문 트레이더 관점
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-text-dim">
                  {n.trader_view}
                </p>
              </div>
              <div className="h-px bg-border" />
              <div>
                <p className="flex items-center gap-1.5 text-[13px] font-bold">
                  <ChartNoAxesColumn className="h-4 w-4 text-accent" strokeWidth={2} />
                  퀀트 모델 관점
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-text-dim">
                  {n.quant_view}
                </p>
              </div>
            </div>
          </Panel>

          {/* ⑤ 리스크 */}
          <Panel title="⑤ 리스크 요인">
            <ul className="space-y-2">
              {n.risks.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-text-dim">
                  <TriangleAlert
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn"
                    strokeWidth={2}
                  />
                  {r}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* ── 우측 레일 ── */}
        <div className="space-y-4">
          {/* ② 게이트 */}
          <Panel
            title="② 거래 가능 게이트"
            action={
              <Badge variant={p.tradability.passed ? "bull" : "bear"} size="md">
                {p.tradability.passed ? "통과" : "미통과"}
              </Badge>
            }
          >
            <ul className="space-y-2.5">
              {p.tradability.checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-11 shrink-0 rounded py-0.5 text-center text-[10px] font-bold ${
                      c.passed
                        ? "bg-good-soft text-good"
                        : "bg-bull-soft text-bull"
                    }`}
                  >
                    {c.passed ? "PASS" : "FAIL"}
                  </span>
                  <span className="min-w-0 flex-1 text-text-dim">{c.label}</span>
                  {typeof c.value === "number" && (
                    <span className="tnum shrink-0 text-2xs font-semibold text-text-mute">
                      {c.key === "liquidity" ? eokwon(c.value) : fmtNum(c.value, 3)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          {/* 퀀트 핵심 수치 */}
          <Panel title="퀀트 핵심 수치">
            <div className="space-y-2">
              {(
                [
                  ["합성 알파", p.factor?.composite_alpha != null ? fmtNum(p.factor.composite_alpha, 3) : null, "text-text"],
                  ["PER", p.valuation?.per != null ? `${fmtNum(p.valuation.per, 1)}배` : null, "text-warn"],
                  [
                    "DCF 업사이드",
                    p.valuation?.upside_pct != null ? fmtPct(p.valuation.upside_pct / 100) : null,
                    (p.valuation?.upside_pct ?? 0) >= 0 ? "text-bull" : "text-bear",
                  ],
                  [
                    `외국인 ${p.flows?.window_days ?? 20}일 순매매`,
                    p.flows?.foreign_net != null ? eokwon(p.flows.foreign_net) : null,
                    (p.flows?.foreign_net ?? 0) >= 0 ? "text-bull" : "text-bear",
                  ],
                  [
                    `기관 ${p.flows?.window_days ?? 20}일 순매매`,
                    p.flows?.inst_net != null ? eokwon(p.flows.inst_net) : null,
                    (p.flows?.inst_net ?? 0) >= 0 ? "text-bull" : "text-bear",
                  ],
                ] as const
              )
                .filter(([, v]) => v != null)
                .map(([label, value, color]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-text-mute">{label}</span>
                    <span className={`tnum text-[13px] font-bold ${color}`}>{value}</span>
                  </div>
                ))}
            </div>
            {p.backtests.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                {p.backtests.map((b) => (
                  <p
                    key={b.setup}
                    className="flex items-center gap-2 text-2xs text-text-mute"
                  >
                    <Badge variant={b.passed ? "bull" : "bear"}>
                      {b.passed ? "PASS" : "FAIL"}
                    </Badge>
                    <span>
                      {b.setup} — 승률 {fmtPct(b.win_rate, 0)} · R:R{" "}
                      {fmtNum(b.avg_rr, 2)}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </Panel>

          {/* 리포트 정보 */}
          <div className="rounded-2xl bg-surface-2 p-4">
            <p className="text-xs font-bold text-text-dim">리포트 정보</p>
            <div className="mt-2 space-y-1 text-2xs leading-relaxed text-text-mute">
              <p>수치 근거 {report.source_refs?.length ?? 0}건 추적 (source_refs)</p>
              <p>발행 {fmtDateTime(report.created_at)} · 일일 자동 배치</p>
              <p>{report.model_version ?? "—"}</p>
            </div>
            <Link
              href="/reports"
              className="mt-2 inline-block text-xs font-semibold text-accent hover:underline"
            >
              ← 리포트 목록
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-2xs leading-relaxed text-text-mute">
        {DISCLAIMER}
      </p>
    </AppShell>
  );
}
