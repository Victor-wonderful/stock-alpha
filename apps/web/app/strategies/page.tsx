import { AppShell } from "@/components/AppShell";
import { Panel, SampleBadge } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { SetupChip, StyleChip } from "@/components/AxisChips";
import { getBacktests } from "@/lib/data";
import { fmtNum, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function StrategiesPage() {
  const { data, isSample } = await getBacktests();
  const passed = data.filter((b) => b.passed).length;

  return (
    <AppShell
      title="검증 · 트랙레코드"
      subtitle="플레이북별 백테스트 — 미통과 전략은 발행하지 않습니다"
      badge={isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        <Panel title="품질 게이트 요약">
          <p className="text-sm text-text-dim">
            전체 <span className="tnum font-semibold text-text">{data.length}</span>개 플레이북 중{" "}
            <span className="tnum font-semibold text-bull">{passed}</span>개 통과 ·{" "}
            <span className="tnum font-semibold text-bear">{data.length - passed}</span>개 미달
          </p>
          <p className="mt-1 text-2xs text-text-mute">
            게이트 기준: 표본 ≥ 20 · 기대값 ≥ +0.05R · R-MDD(트레이드당 리스크 1%) ≤ 40%. 승률·R:R은 보고용 지표. 미통과 셋업은 발행 차단.
          </p>
        </Panel>

        <Panel title="플레이북 성과">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                  <th className="py-2 pl-1 text-left font-medium">플레이북</th>
                  <th className="px-3 py-2 text-left font-medium">스타일</th>
                  <th className="px-3 py-2 text-right font-medium">IC</th>
                  <th className="px-3 py-2 text-right font-medium">Sharpe</th>
                  <th className="px-3 py-2 text-right font-medium">승률</th>
                  <th className="px-3 py-2 text-right font-medium">평균 R:R</th>
                  <th className="px-3 py-2 text-right font-medium">MDD</th>
                  <th className="px-3 py-2 text-right font-medium">턴오버</th>
                  <th className="px-3 py-2 text-left font-medium">기간</th>
                  <th className="px-3 py-2 text-center font-medium">게이트</th>
                </tr>
              </thead>
              <tbody>
                {data.map((b, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-surface-2">
                    <td className="py-2.5 pl-1"><SetupChip setup={b.setup} /></td>
                    <td className="px-3 py-2.5">{b.style ? <StyleChip style={b.style} /> : "—"}</td>
                    <td className="mono px-3 py-2.5 text-right">{fmtNum(b.ic, 3)}</td>
                    <td className="mono px-3 py-2.5 text-right">{fmtNum(b.sharpe, 2)}</td>
                    <td className="mono px-3 py-2.5 text-right">{fmtPct(b.win_rate, 0)}</td>
                    <td className="mono px-3 py-2.5 text-right">{fmtNum(b.avg_rr, 2)}</td>
                    <td className="mono px-3 py-2.5 text-right text-bear">{fmtPct(b.mdd != null ? -Math.abs(b.mdd) : null, 0)}</td>
                    <td className="mono px-3 py-2.5 text-right">{fmtNum(b.turnover, 1)}</td>
                    <td className="px-3 py-2.5 text-2xs text-text-mute">{b.period ?? "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant={b.passed ? "bull" : "bear"} size="md">
                        {b.passed ? "PASS" : "FAIL"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {isSample && (
          <p className="text-2xs text-text-mute">
            * 백테스트 엔진(backtests) 가동 전 예시 성과입니다. `engine backtest` 실행 시 실데이터로 대체됩니다.
          </p>
        )}
      </div>
    </AppShell>
  );
}
