import { AppShell } from "@/components/AppShell";
import { Panel, SampleBadge } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getMarket } from "@/lib/data";
import { fmtNum } from "@/lib/format";
import type { Regime } from "@/lib/types";

export const dynamic = "force-dynamic";

const REGIME_META: Record<Regime, { label: string; variant: "bull" | "warn" | "bear" }> = {
  risk_on: { label: "위험 선호 (Risk-On)", variant: "bull" },
  neutral: { label: "중립 (Neutral)", variant: "warn" },
  risk_off: { label: "위험 회피 (Risk-Off)", variant: "bear" },
};

export default async function MarketPage() {
  const { data, isSample } = await getMarket();
  const { regime, macro, sectors } = data;
  const rm = REGIME_META[regime.regime];
  const gauge = Math.round(((regime.score + 1) / 2) * 100);
  const maxFlow = Math.max(...sectors.map((s) => Math.abs(s.flow)), 1);
  const maxMom = Math.max(...sectors.map((s) => Math.abs(s.momentum)), 1);

  return (
    <AppShell
      title="시장"
      subtitle="매크로 · 레짐 · 섹터 로테이션"
      badge={isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        {/* 레짐 */}
        <Panel title="시장 국면 (레짐)">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="sm:w-64">
              <Badge variant={rm.variant} size="md" className="text-xs">
                {rm.label}
              </Badge>
              <div className="mt-3">
                <div className="flex justify-between text-2xs text-text-mute">
                  <span>위험회피</span>
                  <span>위험선호</span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-gradient-to-r from-bear/40 via-warn/40 to-bull/40">
                  <div
                    className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-text"
                    style={{ left: `${gauge}%` }}
                  />
                </div>
                <p className="tnum mt-1 text-right text-2xs text-text-dim">
                  점수 {regime.score > 0 ? "+" : ""}{regime.score.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="flex-1">
              <p className="mb-2 text-2xs uppercase tracking-wide text-text-mute">주요 동인</p>
              <div className="flex flex-wrap gap-1.5">
                {regime.drivers.map((d) => (
                  <Badge key={d} variant="neutral" size="md">{d}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {/* 매크로 */}
        <Panel title="매크로 지표">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {macro.map((m) => {
              const up = m.change >= 0;
              return (
                <div key={m.series_id} className="rounded-md border border-border bg-surface-2 p-3">
                  <p className="truncate text-2xs text-text-mute">{m.label}</p>
                  <p className="tnum mt-1 text-base font-semibold">
                    {fmtNum(m.value, m.unit === "원" || m.unit === "p" ? 1 : 2)}
                    <span className="ml-0.5 text-2xs font-normal text-text-mute">{m.unit}</span>
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`tnum text-2xs ${up ? "text-bull" : "text-bear"}`}>
                      {up ? "+" : ""}{fmtNum(m.change, 2)}
                    </span>
                    <Sparkline data={m.spark} width={48} height={16} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* 섹터 로테이션 */}
        <Panel title="섹터 로테이션 · 상대 모멘텀 / 수급">
          <div className="space-y-2">
            {sectors.map((s) => (
              <div key={s.sector} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 text-text-dim">{s.sector}</span>
                {/* 모멘텀 막대 (중앙 0) */}
                <div className="relative h-2 flex-1 rounded-full bg-surface-3">
                  <div className="absolute left-1/2 top-0 h-2 w-px bg-border-strong" />
                  <div
                    className={`absolute top-0 h-2 rounded-full ${s.momentum >= 0 ? "bg-bull" : "bg-bear"}`}
                    style={
                      s.momentum >= 0
                        ? { left: "50%", width: `${(s.momentum / maxMom) * 50}%` }
                        : { right: "50%", width: `${(-s.momentum / maxMom) * 50}%` }
                    }
                  />
                </div>
                <span
                  className={`tnum w-24 shrink-0 text-right text-2xs ${s.flow >= 0 ? "text-bull" : "text-bear"}`}
                  title="외인+기관 순매수(억원)"
                >
                  {s.flow >= 0 ? "+" : ""}{s.flow.toLocaleString()}억
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
