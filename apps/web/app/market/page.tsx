import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { SampleBadge } from "@/components/ui";
import { Sparkline } from "@/components/ui/Sparkline";
import { getMarket, getMarketQuotes, getSignalSectorCounts } from "@/lib/data";
import { fmtNum } from "@/lib/format";
import type { Regime, SectorRotationView } from "@/lib/types";

export const dynamic = "force-dynamic";

const REGIME_META: Record<
  Regime,
  { label: string; variant: "bull" | "warn" | "bear"; gaugeLabel: string; color: string }
> = {
  risk_on: {
    label: "강세장 · 공격 (Risk-On)",
    variant: "bull",
    gaugeLabel: "위험 선호",
    color: "bg-good",
  },
  neutral: {
    label: "중립 (Neutral)",
    variant: "warn",
    gaugeLabel: "중립",
    color: "bg-warn",
  },
  risk_off: {
    label: "방어 구간 (위험 회피 · Risk-off)",
    variant: "bear",
    gaugeLabel: "위험 회피",
    color: "bg-bad",
  },
};

// 섹터 사분면 맵 — SVG 기반 (모멘텀 x축, 수급 y축)
function QuadrantMap({ sectors }: { sectors: SectorRotationView[] }) {
  const W = 320, H = 240;
  const maxM = Math.max(...sectors.map((s) => Math.abs(s.momentum)), 1);
  const maxF = Math.max(...sectors.map((s) => Math.abs(s.flow)), 1);

  function toX(m: number) {
    return W / 2 + (m / maxM) * (W / 2 - 24);
  }
  function toY(f: number) {
    return H / 2 - (f / maxF) * (H / 2 - 20);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-[12px] bg-surface-2"
        aria-label="섹터 사분면 맵"
      >
        {/* 십자 축 */}
        <line x1={W / 2} y1={8} x2={W / 2} y2={H - 8} stroke="var(--border-strong)" strokeWidth={1} />
        <line x1={8} y1={H / 2} x2={W - 8} y2={H / 2} stroke="var(--border-strong)" strokeWidth={1} />
        {/* 사분면 라벨 */}
        <text x={W / 2 + 6} y={16} fontSize={8} fill="var(--text-mute)">주도</text>
        <text x={8} y={16} fontSize={8} fill="var(--text-mute)">선취매</text>
        <text x={W / 2 + 6} y={H - 4} fontSize={8} fill="var(--text-mute)">차익실현</text>
        <text x={8} y={H - 4} fontSize={8} fill="var(--text-mute)">소외</text>
        {/* 섹터 점 */}
        {sectors.map((s) => {
          const x = toX(s.momentum);
          const y = toY(s.flow);
          const isPositive = s.momentum >= 0 && s.flow >= 0;
          return (
            <g key={s.sector}>
              <circle
                cx={x}
                cy={y}
                r={5}
                fill={isPositive ? "var(--good)" : "var(--text-mute)"}
                fillOpacity={0.8}
              />
              <text
                x={x + 7}
                y={y + 4}
                fontSize={8}
                fill="var(--text-dim)"
              >
                {s.sector}
              </text>
            </g>
          );
        })}
        {/* 축 레이블 */}
        <text x={W - 40} y={H / 2 - 4} fontSize={7} fill="var(--text-mute)">모멘텀 →</text>
        <text x={W / 2 + 4} y={12} fontSize={7} fill="var(--text-mute)">수급 ↑</text>
      </svg>
    </div>
  );
}

export default async function MarketPage() {
  const [
    { data, isSample },
    { data: quotes },
    { data: signalSectors },
  ] = await Promise.all([
    getMarket(),
    getMarketQuotes(),
    getSignalSectorCounts(),
  ]);
  const { regime, macro, sectors } = data;
  const rm = REGIME_META[regime.regime];

  // 레짐 게이지: score -1~1 → 0~100%
  const gauge = Math.round(((regime.score + 1) / 2) * 100);

  const maxFlow = Math.max(...sectors.map((s) => Math.abs(s.flow)), 1);
  const maxMom = Math.max(...sectors.map((s) => Math.abs(s.momentum)), 1);
  const maxSignalCnt = Math.max(...signalSectors.map((s) => s.count), 1);

  return (
    <AppShell
      title="시장 분석"
      subtitle="매크로 · 레짐 · 섹터 로테이션"
      badge={isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        {/* ── 레짐 히어로 ── */}
        <div className="rounded-[20px] border border-accent/30 bg-surface p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr_auto]">
            {/* 레짐 + 게이지 */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Badge variant={rm.variant} size="md" className="text-xs">
                  {rm.label}
                </Badge>
                <span className="tnum text-lg font-extrabold text-text">
                  {regime.score > 0 ? "+" : ""}{regime.score.toFixed(2)}
                </span>
              </div>

              {/* 3구간 게이지 */}
              <div className="mb-1">
                <div className="relative h-3 overflow-hidden rounded-full bg-gradient-to-r from-bad/50 via-warn/40 to-good/50">
                  <div
                    className="absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-full bg-text shadow-lg"
                    style={{ left: `calc(${gauge}% - 3px)` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-text-mute">
                  <span>약세장 · 방어</span>
                  <span>중립</span>
                  <span>강세장 · 공격</span>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-mute">
                게이지가 왼쪽(빨강)일수록 위험 회피, 오른쪽(그린)일수록 위험 선호 구간
              </p>
            </div>

            {/* 레짐 드라이버 */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-mute">
                레짐 드라이버
              </p>
              <div className="space-y-1.5">
                {regime.drivers.slice(0, 3).map((d, i) => (
                  <div key={d} className="flex items-center gap-2">
                    <span className="text-[10px] text-text-mute">{i + 1}.</span>
                    <span className="text-[12px] text-text-dim">{d}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 코스피·코스닥·원달러·VIX 쿼트 4 */}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {quotes.slice(0, 4).map((q) => (
                <div
                  key={q.id}
                  className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-center"
                >
                  <p className="text-[10px] text-text-mute">{q.label}</p>
                  <p className="tnum mt-0.5 text-sm font-bold text-text">
                    {fmtNum(q.value, q.unit === "원" ? 0 : 2)}
                    <span className="ml-0.5 text-[9px] text-text-mute">{q.unit}</span>
                  </p>
                  <p
                    className={`tnum mt-0.5 text-[10px] font-semibold ${
                      q.up ? "text-good" : "text-bad"
                    }`}
                  >
                    {q.up ? "+" : ""}{fmtNum(q.change, 2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 매크로 지표 ── */}
        <div className="rounded-[20px] border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-bold">매크로 지표</h2>
            <span className="text-[10px] text-text-mute">해외 변수는 모닝 배치 갱신</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {macro.map((m) => {
              const up = m.change >= 0;
              return (
                <div
                  key={m.series_id}
                  className="rounded-[12px] border border-border bg-surface-2 p-3"
                >
                  <p className="truncate text-[10px] text-text-mute">{m.label}</p>
                  <p className="tnum mt-1 text-[15px] font-bold text-text">
                    {fmtNum(m.value, m.unit === "원" || m.unit === "p" ? 1 : 2)}
                    <span className="ml-0.5 text-[9px] font-normal text-text-mute">{m.unit}</span>
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`tnum text-[10px] font-semibold ${up ? "text-good" : "text-bad"}`}>
                      {up ? "+" : ""}{fmtNum(m.change, 2)}
                    </span>
                    <Sparkline data={m.spark} width={48} height={16} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 수급·브레드스 ── */}
        <div className="rounded-[20px] border border-border bg-surface p-5">
          <h2 className="mb-3 text-[13px] font-bold">수급 · 브레드스 (5일)</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {/* 외국인/기관/개인 막대 */}
            <div className="space-y-2">
              {[
                { label: "외국인", flow: macro.find((m) => m.series_id === "FOREIGN")?.change ?? 0 },
                { label: "기관", flow: macro.find((m) => m.series_id === "INST")?.change ?? 0 },
                { label: "개인", flow: macro.find((m) => m.series_id === "RETAIL")?.change ?? 0 },
              ].map(({ label, flow }) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0 text-text-mute">{label}</span>
                  <div className="relative h-2 flex-1 rounded-full bg-surface-3">
                    <div className="absolute left-1/2 top-0 h-2 w-px bg-border-strong" />
                    <div
                      className={`absolute top-0 h-2 rounded-full ${flow >= 0 ? "bg-good" : "bg-bad"}`}
                      style={flow >= 0
                        ? { left: "50%", width: "25%" }
                        : { right: "50%", width: "15%" }}
                    />
                  </div>
                  <span className={`tnum w-16 shrink-0 text-right text-[10px] ${flow >= 0 ? "text-good" : "text-bad"}`}>
                    데이터 미제공
                  </span>
                </div>
              ))}
            </div>
            {/* 상승종목 비중 게이지 */}
            <div>
              <p className="mb-2 text-[10px] text-text-mute">상승 종목 비중 (브레드스)</p>
              <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
                <div className="h-3 w-3/5 rounded-full bg-good/50" />
                <div
                  className="absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-good"
                  style={{ left: "60%" }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-text-mute">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <p className="mt-1 text-[10px] text-text-mute">실데이터 미연결 — 예시</p>
            </div>
          </div>
        </div>

        {/* ── 섹터 로테이션 ── */}
        <div className="rounded-[20px] border border-border bg-surface p-5">
          <h2 className="mb-4 text-[13px] font-bold">섹터 로테이션</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {/* 사분면 맵 */}
            <div>
              <p className="mb-2 text-[10px] font-semibold text-text-mute">모멘텀 × 수급 사분면</p>
              <QuadrantMap sectors={sectors} />
            </div>

            {/* 오늘 시그널 섹터 분포 바 */}
            <div>
              <p className="mb-2 text-[10px] font-semibold text-text-mute">
                오늘 시그널 섹터 분포
              </p>
              <div className="space-y-1.5">
                {signalSectors.slice(0, 7).map((s) => (
                  <div key={s.sector} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-text-mute">{s.sector}</span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-2 rounded-full bg-accent/70"
                        style={{ width: `${(s.count / maxSignalCnt) * 100}%` }}
                      />
                    </div>
                    <span className="tnum w-6 shrink-0 text-right text-[10px] text-text-mute">
                      {s.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 섹터 테이블 */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["순위", "섹터", "모멘텀z", "수급 5일", "오늘 시그널", "상대강도"].map((h) => (
                    <th key={h} className="pb-1.5 pr-3 text-left text-[10px] font-medium text-text-mute first:w-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectors.map((s, i) => {
                  const sigCount = signalSectors.find((sc) => sc.sector === s.sector)?.count ?? 0;
                  const relStr = Math.round((Math.abs(s.momentum) / maxMom) * 100);
                  return (
                    <tr key={s.sector} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 text-[10px] text-text-mute">{i + 1}</td>
                      <td className="py-2 pr-3 font-medium text-text">{s.sector}</td>
                      <td className={`tnum py-2 pr-3 font-semibold ${s.momentum >= 0 ? "text-good" : "text-bad"}`}>
                        {s.momentum > 0 ? "+" : ""}{fmtNum(s.momentum, 2)}
                      </td>
                      <td className={`tnum py-2 pr-3 ${s.flow >= 0 ? "text-good" : "text-bad"}`}>
                        {s.flow >= 0 ? "+" : ""}{s.flow.toLocaleString()}억
                      </td>
                      <td className="tnum py-2 pr-3 text-text-dim">
                        {sigCount > 0 ? `${sigCount}건` : "—"}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
                            <div
                              className={`h-1.5 rounded-full ${s.momentum >= 0 ? "bg-good" : "bg-bad"}`}
                              style={{ width: `${relStr}%` }}
                            />
                          </div>
                          <span className={`tnum text-[10px] ${s.momentum >= 0 ? "text-good" : "text-bad"}`}>
                            {relStr}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
