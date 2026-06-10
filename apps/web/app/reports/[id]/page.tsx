import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { SetupChip, StyleChip } from "@/components/AxisChips";
import { Panel, Stat, StrengthBar } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getReportById } from "@/lib/data";
import { fmtNum, fmtPct, fmtPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

const DISCLAIMER =
  "본 자료는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고 정보이며, 특정 개인에 대한 맞춤형 투자자문이 아닙니다. 투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다. 과거 성과(백테스트 포함)는 미래 수익을 보장하지 않습니다.";

function ratingTone(rating: string) {
  if (rating === "매수") return "bull" as const;
  if (rating === "거래 부적합") return "bear" as const;
  return "default" as const;
}

function eokwon(v: number | null): string {
  return v == null ? "—" : `${(v / 1e8).toFixed(1)}억원`;
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

  return (
    <AppShell
      title={report.title}
      subtitle={`${p.instrument.name} (${p.instrument.symbol}) · ${report.as_of} · ${report.model_version ?? ""}`}
    >
      <div className="space-y-4">
        {/* ① 판정 */}
        <Panel title="① 판정 — 사야 하나">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="투자의견"
              value={p.verdict.rating}
              tone={ratingTone(p.verdict.rating)}
            />
            <Stat label="종합 점수" value={`${p.verdict.score}점`} sub="100점 만점" />
            <Stat label="현재가" value={`${fmtPrice(p.last_close)}원`} />
            <Stat
              label="1차 목표가"
              value={p.plan[0]?.tp1 != null ? `${fmtPrice(p.plan[0].tp1)}원` : "—"}
            />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-dim">{n.thesis}</p>
          <p className="mt-2 text-2xs text-text-mute">
            가중치 — 멀티팩터 {p.verdict.weights.factor} · 밸류에이션{" "}
            {p.verdict.weights.valuation} · 시그널 {p.verdict.weights.signal}
          </p>
        </Panel>

        {/* ② 거래가능 게이트 */}
        <Panel
          title="② 거래 가능 게이트 — 거래해도 괜찮나"
          action={
            <Badge variant={p.tradability.passed ? "bull" : "bear"} size="md">
              {p.tradability.passed ? "통과" : "미통과"}
            </Badge>
          }
        >
          <ul className="space-y-2">
            {p.tradability.checks.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <Badge variant={c.passed ? "bull" : "bear"}>
                  {c.passed ? "PASS" : "FAIL"}
                </Badge>
                <span className="text-text-dim">{c.label}</span>
                {typeof c.value === "number" && (
                  <span className="tnum text-2xs text-text-mute">
                    ({c.key === "liquidity" ? eokwon(c.value) : fmtNum(c.value, 4)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        {/* ③ 실행 플랜 */}
        <Panel title="③ 실행 플랜 — 얼마에 사고, 팔고, 손절하나">
          {p.plan.length === 0 ? (
            <p className="text-sm text-text-mute">현재 발행된 매수 셋업이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                    <th className="py-2 pl-1 text-left font-medium">스타일</th>
                    <th className="px-3 py-2 text-left font-medium">셋업</th>
                    <th className="px-3 py-2 text-right font-medium">진입가</th>
                    <th className="px-3 py-2 text-right font-medium">손절가</th>
                    <th className="px-3 py-2 text-right font-medium">TP1</th>
                    <th className="px-3 py-2 text-right font-medium">TP2</th>
                    <th className="px-3 py-2 text-right font-medium">R:R</th>
                    <th className="px-3 py-2 text-left font-medium">신뢰도</th>
                  </tr>
                </thead>
                <tbody>
                  {p.plan.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/50 last:border-0 hover:bg-surface-2"
                    >
                      <td className="py-2.5 pl-1">
                        <StyleChip style={row.style} />
                      </td>
                      <td className="px-3 py-2.5">
                        <SetupChip setup={row.setup} />
                      </td>
                      <td className="mono px-3 py-2.5 text-right">
                        {fmtPrice(row.entry_price)}
                      </td>
                      <td className="mono px-3 py-2.5 text-right text-bear">
                        {fmtPrice(row.stop_loss)}
                      </td>
                      <td className="mono px-3 py-2.5 text-right text-bull">
                        {fmtPrice(row.tp1)}
                      </td>
                      <td className="mono px-3 py-2.5 text-right text-bull">
                        {fmtPrice(row.tp2)}
                      </td>
                      <td className="mono px-3 py-2.5 text-right">
                        {fmtNum(row.risk_reward, 2)}
                      </td>
                      <td className="px-3 py-2.5">
                        <StrengthBar value={row.strength} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ④ 근거 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="④ 근거 — 전문 트레이더 관점">
            <p className="text-sm leading-relaxed text-text-dim">{n.trader_view}</p>
          </Panel>
          <Panel title="④ 근거 — 퀀트 모델 관점">
            <p className="text-sm leading-relaxed text-text-dim">{n.quant_view}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {p.factor?.composite_alpha != null && (
                <Stat label="합성 알파" value={fmtNum(p.factor.composite_alpha, 3)} />
              )}
              {p.valuation?.per != null && (
                <Stat label="PER" value={fmtNum(p.valuation.per, 1)} />
              )}
              {p.valuation?.upside_pct != null && (
                <Stat
                  label="DCF 업사이드"
                  value={fmtPct(p.valuation.upside_pct / 100)}
                  tone={p.valuation.upside_pct >= 0 ? "bull" : "bear"}
                />
              )}
              {p.flows?.foreign_net != null && (
                <Stat
                  label={`외국인 ${p.flows.window_days}일 순매매`}
                  value={eokwon(p.flows.foreign_net)}
                  tone={p.flows.foreign_net >= 0 ? "bull" : "bear"}
                />
              )}
              {p.flows?.inst_net != null && (
                <Stat
                  label={`기관 ${p.flows.window_days}일 순매매`}
                  value={eokwon(p.flows.inst_net)}
                  tone={p.flows.inst_net >= 0 ? "bull" : "bear"}
                />
              )}
            </div>
            {p.backtests.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {p.backtests.map((b) => (
                  <p key={b.setup} className="flex items-center gap-2 text-2xs text-text-mute">
                    <Badge variant={b.passed ? "bull" : "bear"}>
                      {b.passed ? "PASS" : "FAIL"}
                    </Badge>
                    <span>
                      {b.setup} — 승률 {fmtPct(b.win_rate, 0)} · R:R{" "}
                      {fmtNum(b.avg_rr, 2)} · MDD {fmtPct(b.mdd, 0)}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ⑤ 리스크 */}
        <Panel title="⑤ 리스크 요인">
          <ul className="list-disc space-y-1.5 pl-4 text-sm text-text-dim">
            {n.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Panel>

        <p className="rounded-md border border-border bg-surface-2 p-3 text-2xs leading-relaxed text-text-mute">
          {DISCLAIMER}
        </p>
        <p className="text-2xs text-text-mute">
          수치 근거 {report.source_refs?.length ?? 0}건 추적(source_refs) ·{" "}
          <Link href="/reports" className="text-accent hover:underline">
            ← 리포트 목록
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
