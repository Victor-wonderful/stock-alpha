import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Panel, SampleBadge, StrengthBar } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { StyleChip } from "@/components/AxisChips";
import { getRecommendations } from "@/lib/data";
import { fmtPct, fmtPrice } from "@/lib/format";
import type { RecommendationView } from "@/lib/types";

export const dynamic = "force-dynamic";

// 바스켓 내부 키 → 표시 라벨
const BASKET_LABELS: Record<string, string> = {
  daily_focus: "오늘의 포커스 — 시스템 기준 통과 후보",
  screener: "스크리너 바스켓",
  model_portfolio: "모델 포트폴리오",
  theme: "테마 바스켓",
};

export default async function PortfolioPage() {
  const { data, isSample } = await getRecommendations();

  // 바스켓별 그룹핑 — daily_focus(오늘의 포커스)를 최상단에.
  const baskets = new Map<string, RecommendationView[]>();
  const ordered = [...data].sort(
    (a, b) =>
      (a.basket_type === "daily_focus" ? 0 : 1) -
      (b.basket_type === "daily_focus" ? 0 : 1),
  );
  for (const r of ordered) {
    const arr = baskets.get(r.basket_type) ?? [];
    arr.push(r);
    baskets.set(r.basket_type, arr);
  }

  return (
    <AppShell
      title="모델 포트폴리오"
      subtitle="팩터·테마 바스켓 · 추천주 · 리밸런싱"
      badge={isSample ? <SampleBadge /> : undefined}
    >
      <div className="space-y-4">
        {[...baskets.entries()].map(([name, rows]) => {
          const total = rows.reduce((a, r) => a + r.weight, 0);
          const isFocus = name === "daily_focus";
          return (
            <Panel
              key={name}
              title={BASKET_LABELS[name] ?? name}
              action={
                <span className="tnum text-2xs text-text-mute">
                  {rows.length}종목
                  {isFocus
                    ? rows[0]?.as_of
                      ? ` · ${rows[0].as_of} 16:30 기준`
                      : ""
                    : ` · 합계 ${(total * 100).toFixed(0)}%`}
                </span>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                      <th className="py-2 pl-1 text-left font-medium">종목</th>
                      <th className="px-3 py-2 text-left font-medium">스타일</th>
                      <th className="px-3 py-2 text-left font-medium">비중</th>
                      <th className="px-3 py-2 text-left font-medium">컨빅션</th>
                      <th className="px-3 py-2 text-right font-medium">진입</th>
                      <th className="px-3 py-2 text-right font-medium">목표</th>
                      <th className="px-3 py-2 text-right font-medium">손절</th>
                      <th className="px-3 py-2 text-right font-medium">목표수익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const upside =
                        r.target_price && r.entry_price
                          ? r.target_price / r.entry_price - 1
                          : null;
                      return (
                        <tr key={r.symbol} className="group border-b border-border/50 last:border-0 hover:bg-surface-2">
                          <td className="py-2.5 pl-1">
                            <Link href={`/stocks/${r.symbol}`} className="font-medium group-hover:text-accent">
                              {r.name}
                            </Link>
                            <span className="mono ml-2 text-2xs text-text-mute">{r.symbol}</span>
                            <p className="mt-0.5 max-w-md truncate text-2xs text-text-mute">{r.thesis}</p>
                          </td>
                          <td className="px-3 py-2.5"><StyleChip style={r.style} /></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                                <div className="h-full bg-accent" style={{ width: `${r.weight * 100 * 3}%` }} />
                              </div>
                              <span className="tnum text-2xs text-text-dim">{(r.weight * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5"><StrengthBar value={r.conviction} /></td>
                          <td className="mono px-3 py-2.5 text-right">{fmtPrice(r.entry_price)}</td>
                          <td className="mono px-3 py-2.5 text-right text-bull">{fmtPrice(r.target_price)}</td>
                          <td className="mono px-3 py-2.5 text-right text-bear">{fmtPrice(r.stop_loss)}</td>
                          <td className={`mono px-3 py-2.5 text-right ${(upside ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
                            {fmtPct(upside)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })}

        {isSample && (
          <p className="text-2xs text-text-mute">
            * 추천 엔진(recommendations) 가동 전 예시 바스켓입니다. 리밸런싱 시 실데이터로 대체됩니다.
          </p>
        )}

        <p className="text-2xs leading-relaxed text-text-mute">
          본 정보는 유사투자자문업자가 불특정 다수에게 제공하는 투자 참고 정보이며,
          특정 개인에 대한 맞춤형 투자자문이 아닙니다. 투자 판단의 책임은 투자자
          본인에게 있습니다.
        </p>
      </div>
    </AppShell>
  );
}
