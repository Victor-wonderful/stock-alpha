import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { getPickHistory, type PickRecord } from "@/lib/data";
import { fmtPct, fmtPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

// 상태 → 배지 스타일
const STATUS_BADGE: Record<string, string> = {
  "목표 도달": "bg-good-soft text-good",
  손절: "bg-bad-soft text-bad",
  진행중: "bg-warn-soft text-warn",
  만료: "bg-surface-3 text-text-dim",
  "—": "bg-surface-3 text-text-mute",
};

const FILTERS = ["전체", "진행중", "목표 도달", "손절", "만료"] as const;

export default async function PicksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filter = sp.status && FILTERS.includes(sp.status as (typeof FILTERS)[number])
    ? sp.status
    : "전체";

  const history = await getPickHistory(500);
  const all = history.data;
  const rows = filter === "전체" ? all : all.filter((r) => r.status === filter);

  // 요약 집계 — 전체 발행 기준 (필터와 무관)
  const closedTarget = all.filter((r) => r.status === "목표 도달");
  const closedStop = all.filter((r) => r.status === "손절");
  const closed = all.filter((r) => r.closed && r.return_pct != null);
  const avgClosed =
    closed.length > 0
      ? closed.reduce((a, r) => a + (r.return_pct ?? 0), 0) / closed.length
      : null;
  const avg = (list: PickRecord[]) =>
    list.length > 0
      ? list.reduce((a, r) => a + (r.return_pct ?? 0), 0) / list.length
      : null;
  const count = (s: string) =>
    s === "전체" ? all.length : all.filter((r) => r.status === s).length;

  return (
    <AppShell
      title="픽 기록"
      subtitle="발행한 모든 픽의 전체 기록 — 수정·삭제 없음 · 종가 기준 자동 확정 (목표 / 손절 / 만료 30일)"
      badge={
        <span className="rounded-[999px] border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold text-text-dim">
          🔒 기록 불변 — 발행 후 수정 불가
        </span>
      }
    >
      <div className="space-y-4">
        {/* 요약 스탯 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "누적 발행", value: `${all.length}건`, sub: "전체 트랙레코드", color: "text-text" },
            {
              label: "목표 달성",
              value: `${closedTarget.length}건${all.length ? ` (${Math.round((closedTarget.length / all.length) * 100)}%)` : ""}`,
              sub: avg(closedTarget) != null ? `평균 ${fmtPct(avg(closedTarget))}` : undefined,
              color: "text-good",
            },
            {
              label: "손절",
              value: `${closedStop.length}건${all.length ? ` (${Math.round((closedStop.length / all.length) * 100)}%)` : ""}`,
              sub: avg(closedStop) != null ? `평균 ${fmtPct(avg(closedStop))}` : undefined,
              color: "text-bad",
            },
            {
              label: "확정 픽 평균 수익률",
              value: avgClosed != null ? fmtPct(avgClosed) : "—",
              sub: "만료 포함 · 확정 기준",
              color: avgClosed != null && avgClosed >= 0 ? "text-good" : "text-bad",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="flex flex-col gap-1 rounded-[12px] border border-border bg-surface px-4 py-3.5">
              <span className="text-[11px] text-text-mute">{label}</span>
              <span className={`tnum text-xl font-extrabold leading-none ${color}`}>{value}</span>
              {sub && <span className="text-[11px] text-text-mute">{sub}</span>}
            </div>
          ))}
        </div>

        {/* 상태 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "전체" ? "/picks" : `/picks?status=${encodeURIComponent(f)}`}
              className={`rounded-[999px] border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                filter === f
                  ? "border-accent bg-accent text-[#0B0C10]"
                  : "border-border bg-surface-2 text-text-dim hover:text-text"
              }`}
            >
              {f} {count(f)}
            </Link>
          ))}
        </div>

        {/* 픽 테이블 */}
        <section className="rounded-[20px] border border-border bg-surface px-5 py-4">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-mute">
              {all.length === 0 ? "발행된 픽이 없습니다 — 매일 16:30 일일 배치에서 생성됩니다" : "해당 상태의 픽이 없습니다"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-2xs uppercase tracking-wide text-text-mute">
                    <th className="py-2 pl-1 text-left font-medium">종목</th>
                    <th className="px-3 py-2 text-left font-medium">발행일</th>
                    <th className="px-3 py-2 text-right font-medium">진입가</th>
                    <th className="px-3 py-2 text-right font-medium">목표가</th>
                    <th className="px-3 py-2 text-right font-medium">손절가</th>
                    <th className="px-3 py-2 text-right font-medium">수익률</th>
                    <th className="px-3 py-2 text-right font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.as_of}-${r.symbol}-${i}`} className="border-b border-border/50 last:border-0 hover:bg-surface-2">
                      <td className="py-2.5 pl-1">
                        <Link href={`/stocks/${r.symbol}`} className="font-medium text-text hover:text-accent">
                          {r.name}
                        </Link>
                        <span className="mono ml-2 text-2xs text-text-mute">{r.symbol}</span>
                      </td>
                      <td className="tnum px-3 py-2.5 text-left text-text-dim">{r.as_of}</td>
                      <td className="tnum px-3 py-2.5 text-right text-text">{fmtPrice(r.entry_price)}</td>
                      <td className="tnum px-3 py-2.5 text-right text-good">{fmtPrice(r.target_price)}</td>
                      <td className="tnum px-3 py-2.5 text-right text-bad">{fmtPrice(r.stop_loss)}</td>
                      <td
                        className={`tnum px-3 py-2.5 text-right font-bold ${
                          r.return_pct == null ? "text-text-mute" : r.return_pct >= 0 ? "text-good" : "text-bad"
                        }`}
                      >
                        {r.return_pct != null ? fmtPct(r.return_pct) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`rounded-[999px] px-2.5 py-0.5 text-[10px] font-bold ${STATUS_BADGE[r.status]}`}>
                          {r.status}
                          {!r.closed && r.status !== "진행중" && r.status !== "—" ? " (예정)" : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-text-mute">
            진행중 픽은 매일 16:30 종가로 평가 — 목표·손절 도달 시 자동 확정되며, &quot;(예정)&quot;은 종가 확정 배치 전 상태입니다.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
