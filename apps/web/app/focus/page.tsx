import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { StyleChip } from "@/components/AxisChips";
import { EmptyState, Panel, SampleBadge, Stat, StrengthBar } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getRecommendations, getReports } from "@/lib/data";
import { fmtPct, fmtPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

// 오늘의 포커스 — 제품의 첫 화면이자 첫 번째 답: "오늘 뭘 봐야 하나".
// 픽은 사람이 고르지 않는다. 발행 규정 v1 기준을 통과한 종목만, 기준 미달이면 빈 날.
export default async function FocusPage() {
  const recs = await getRecommendations();
  const picks = recs.isSample
    ? []
    : recs.data.filter((r) => r.basket_type === "daily_focus");
  const asOf = picks[0]?.as_of ?? null;

  const { data: reports } = await getReports(100);
  const buys = reports.filter((r) => r.rating === "매수");
  const neutrals = reports.filter((r) => r.rating === "중립").slice(0, 6);

  return (
    <AppShell
      title="오늘의 포커스"
      subtitle="시스템 기준을 통과한 관심 후보 — 사람이 고르지 않습니다"
      badge={recs.isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        {/* 픽 카드 */}
        <Panel
          title="포커스 종목"
          action={
            asOf ? (
              <span className="text-2xs text-text-mute">{asOf} 16:30 기준</span>
            ) : undefined
          }
        >
          {picks.length === 0 ? (
            <EmptyState message="오늘은 기준(판정·거래가능 게이트·백테스트)을 통과한 종목이 없습니다. 억지로 채우지 않습니다 — 기준 미달이면 빈 날입니다." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {picks.map((p) => {
                const upside =
                  p.target_price && p.entry_price
                    ? p.target_price / p.entry_price - 1
                    : null;
                return (
                  <Link key={p.symbol} href={`/stocks/${p.symbol}`} className="block">
                    <div className="h-full rounded-lg border border-border bg-surface-2 p-4 transition-colors hover:border-border-strong">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{p.name}</span>
                          <span className="mono text-2xs text-text-mute">{p.symbol}</span>
                        </div>
                        <StyleChip style={p.style} />
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-text-dim">
                        {p.thesis}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Stat label="진입" value={fmtPrice(p.entry_price)} />
                        <Stat label="목표" value={fmtPrice(p.target_price)} tone="bull" />
                        <Stat label="손절" value={fmtPrice(p.stop_loss)} tone="bear" />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xs text-text-mute">확신도</span>
                          <StrengthBar value={p.conviction} />
                        </div>
                        <span
                          className={`tnum text-xs font-semibold ${
                            (upside ?? 0) >= 0 ? "text-bull" : "text-bear"
                          }`}
                        >
                          목표수익 {fmtPct(upside)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        {/* 매수 판정 */}
        <Panel title="매수 판정 종목 분석">
          {buys.length === 0 ? (
            <p className="text-sm text-text-mute">
              현재 매수 판정 종목이 없습니다. 판정은 멀티팩터·밸류에이션·시그널을
              가중 합산한 시스템 점수(65점 이상)로만 결정됩니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {buys.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/reports/${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5 transition-colors hover:border-border-strong"
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant="bull" size="md">매수</Badge>
                      <span className="text-sm font-medium">{r.name}</span>
                      <span className="mono text-2xs text-text-mute">{r.symbol}</span>
                    </span>
                    <span className="text-2xs text-text-mute">
                      {r.target_price != null && (
                        <span className="tnum mr-3 text-text-dim">
                          목표 {fmtPrice(r.target_price)}원
                        </span>
                      )}
                      {r.as_of} · 분석 보기 →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* 중립 상위 — 차순위 관찰 대상 */}
        {neutrals.length > 0 && (
          <Panel title="관찰 대상 (중립 판정 상위)">
            <div className="flex flex-wrap gap-2">
              {neutrals.map((r) => (
                <Link
                  key={r.id}
                  href={`/reports/${r.id}`}
                  className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-dim transition-colors hover:border-border-strong hover:text-text"
                >
                  {r.name} <span className="mono text-2xs text-text-mute">{r.symbol}</span>
                </Link>
              ))}
            </div>
          </Panel>
        )}

        <div className="flex flex-wrap gap-3 text-xs">
          <Link href="/reports" className="text-accent hover:underline">
            전체 종목 분석 →
          </Link>
          <Link href="/screener" className="text-accent hover:underline">
            전체 시그널 →
          </Link>
          <Link href="/strategies" className="text-accent hover:underline">
            검증·트랙레코드 →
          </Link>
        </div>

        <p className="text-2xs leading-relaxed text-text-mute">
          본 정보는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고 정보이며,
          특정 개인에 대한 맞춤형 투자자문이 아닙니다. 투자 판단과 그 결과에 대한
          책임은 투자자 본인에게 있습니다. 과거 성과는 미래 수익을 보장하지 않습니다.
        </p>
      </div>
    </AppShell>
  );
}
