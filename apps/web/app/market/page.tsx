import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MarketBrief } from "@/components/MarketBrief";
import { RecentCoverage } from "@/components/RecentCoverage";
import { Badge } from "@/components/ui/badge";
import { SampleBadge } from "@/components/ui";
import { Sparkline } from "@/components/ui/Sparkline";
import {
  getEventEvidence,
  getLatestDisclosures,
  getMarket,
  getMarketQuotes,
  getMorningBrief,
  getNextTradingDay,
  getSignalSectorCounts,
} from "@/lib/data";
import {
  VERDICT_CLASS,
  VERDICT_LABEL,
  contradictsDirection,
  evidenceSentence,
} from "@/lib/events";
import { fmtNum, tradingDayLabel } from "@/lib/format";
import type { Regime, SectorRotationView } from "@/lib/types";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

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
    { data: disclosures },
    evidence,
  ] = await Promise.all([
    getMarket(),
    getMarketQuotes(),
    getSignalSectorCounts(),
    // 방향당 상한을 넉넉히 — 그날 공시를 전부 보여준다(8/14 기준 호재 36·악재 30·중립 24).
    // 열마다 내부 스크롤이 있어 페이지 길이는 늘지 않는다.
    getLatestDisclosures(60),
    // 유형별 성적표 — 호재/악재 분류는 추측이라 실측을 함께 붙인다.
    getEventEvidence(),
  ]);
  const { regime, macro, sectors } = data;
  const rm = REGIME_META[regime.regime];

  // 레짐 게이지: score -1~1 → 0~100%
  const gauge = Math.round(((regime.score + 1) / 2) * 100);

  const maxFlow = Math.max(...sectors.map((s) => Math.abs(s.flow)), 1);
  const maxMom = Math.max(...sectors.map((s) => Math.abs(s.momentum)), 1);
  const maxSignalCnt = Math.max(...signalSectors.map((s) => s.count), 1);

  // 오늘의 시황 — 2026-08-22 에 홈에서 옮겨 왔다(IA 1단계).
  // 내용은 «전망»이 아니라 «오늘 무슨 일이 있었나 + 과거 같은 상황의 빈도»다.
  // 442거래일 측정에서 무조건 "오른다"의 적중률이 55.3%였다 — 전망을 쓰면 그 55%가
  // 시스템 실력으로 읽힌다. MarketBrief 는 기준선과 뚜렷한 차이가 없으면 아예
  // 표시하지 않는다(components/MarketBrief 주석). 그 판단을 잃지 않으려고 옮겼다.
  const brief = await getMorningBrief();
  const briefAsOf = brief.data?.as_of ?? null;
  const briefPlanDay = briefAsOf ? await getNextTradingDay(briefAsOf) : null;

  return (
    <AppShell
      title="시장"
      asOf={briefAsOf ? `${tradingDayLabel(briefAsOf)} 기준` : null}
      subtitle="지금 시장이 어떤 구간인가 — 매크로 · 레짐 · 섹터 · 공시. 전망이 아니라 잰 값입니다."
      stats={[
        { label: "레짐", value: rm.label },
        { label: "레짐 점수", value: `${gauge}`, tone: "accent" as const },
        { label: "섹터", value: `${sectors.length}` },
      ]}
      badge={isSample ? <SampleBadge /> : undefined}
    >
      {brief.data?.market && (
        <section className="mb-5 rounded-[12px] border border-border-soft bg-surface/40 p-5">
          <MarketBrief market={brief.data.market} planDay={briefPlanDay} />
        </section>
      )}

      {/* 최근 보도 — 2026-08-22 에 홈에서 옮겨 왔다(IA 1단계). 보도는 종목 판단이
          아니라 «맥락»이라 시장이 제자리다. */}
      <RecentCoverage />

      {/* ── 공시 모음 ──
          호재·중립·악재를 좌우중간 3열로 모두 보여준다. 한 덩어리로 뽑아 자르면
          건수 많은 방향이 나머지를 밀어내 통째로 사라진다(초기 구현에서 악재 30건이
          자리를 다 먹어 호재 36건이 화면에서 증발했다).
          열마다 내부 스크롤을 둬 그날 공시를 전부 볼 수 있게 하되 페이지는 안 길어진다. */}
      <div className="mb-5 rounded-[12px] border border-border bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="flex items-baseline gap-2 text-[13px] font-bold">
            공시 모음
            <span className="text-[11px] font-medium text-text-mute">
              {disclosures.asOf ? `${disclosures.asOf} 접수` : "접수일 미상"} ·{" "}
              {disclosures.positive.length + disclosures.neutral.length + disclosures.negative.length}건
            </span>
          </h2>
          <span className="text-[11px] text-text-mute">
            호재·악재는 분류이고, 배지는 실제로 세어본 결과입니다
          </span>
        </div>

        {disclosures.asOf == null ? (
          <p className="py-4 text-sm text-text-mute">표시할 공시가 없습니다.</p>
        ) : (
          <div className="grid gap-x-6 gap-y-6 lg:grid-cols-3 lg:divide-x lg:divide-border-soft">
            {[
              { key: "positive", label: "호재", rows: disclosures.positive, tone: "text-good", chip: "bg-good-soft text-good", pad: "lg:pr-6" },
              { key: "neutral", label: "중립", rows: disclosures.neutral, tone: "text-text-dim", chip: "bg-surface-2 text-text-dim", pad: "lg:px-6" },
              { key: "negative", label: "악재", rows: disclosures.negative, tone: "text-bad", chip: "bg-bad-soft text-bad", pad: "lg:pl-6" },
            ].map(({ key, label, rows, tone, chip, pad }) => (
              <div key={key} className={pad}>
                <div className="mb-2 flex items-baseline gap-2 border-b border-border-soft pb-2">
                  <span className={`rounded-[4px] px-1.5 py-px text-[10px] font-semibold ${chip}`}>
                    {label}
                  </span>
                  <span className={`tnum text-sm font-bold ${tone}`}>{rows.length}건</span>
                </div>
                {rows.length === 0 ? (
                  <p className="py-3 text-[12px] text-text-mute">해당 공시가 없습니다.</p>
                ) : (
                  <div className="no-scrollbar max-h-[320px] divide-y divide-border-soft overflow-y-auto">
                    {rows.map((d) => {
                      // 이 유형의 과거 성적. 호재/악재 분류는 보고서 이름을 보고 붙인
                      // 가설이고, 이건 실제로 세어본 결과다. 둘이 어긋날 때가 가장
                      // 알려줄 값이 크다(공급계약 = '호재' 분류인데 실측은 '조심').
                      const ev = d.eventType ? evidence.get(d.eventType) : undefined;
                      const flips = contradictsDirection(d.direction, ev?.verdict);
                      return (
                        <div key={d.id} className="py-2">
                          <div className="flex items-baseline gap-1.5">
                            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-text">
                              {d.symbol ? (
                                <Link href={`/stocks/${d.symbol}`} className="hover:text-accent">
                                  {d.name ?? d.symbol}
                                </Link>
                              ) : (
                                d.name ?? "—"
                              )}
                            </span>
                            {ev && (
                              <span
                                className={`shrink-0 rounded-[4px] px-1.5 py-px text-[10px] font-semibold ${VERDICT_CLASS[ev.verdict]}`}
                                title={evidenceSentence(ev) ?? undefined}
                              >
                                {VERDICT_LABEL[ev.verdict]}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-text-mute">{d.reportName}</div>
                          {/* 근거 한 줄 — 판정이 선 유형만. 모르는 건 조용히 둔다. */}
                          {ev && ev.verdict !== "insufficient" && (
                            <div className="mt-0.5 text-[10px] leading-relaxed text-text-dim">
                              {flips && (
                                <span className="text-warn">분류와 실측이 다름 · </span>
                              )}
                              {evidenceSentence(ev)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4">
        <div className="rounded-[12px] border border-border bg-surface p-5">
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
        <div className="rounded-[12px] border border-border bg-surface p-5">
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
        <div className="rounded-[12px] border border-border bg-surface p-5">
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
