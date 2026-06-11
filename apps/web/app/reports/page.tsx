import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getPickHistory, getReports } from "@/lib/data";
import { fmtPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

function ratingVariant(rating: string | null) {
  if (rating === "매수") return "bull" as const;
  if (rating === "중립") return "warn" as const;
  if (rating === "거래 부적합") return "bear" as const;
  return "neutral" as const;
}

function fmtDateHeader(asOf: string): string {
  const d = new Date(asOf + "T00:00:00+09:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// 종목 분석 리스트 (UI V2) — 오늘의 포커스가 "어디서 뽑혔는지" 보이는 화면.
// 날짜 그룹핑 + 판정 필터 + ⭐ 픽 배지로 포커스와의 관계를 명시한다.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const includeUnfit = sp.all === "1";
  const ratingFilter = sp.rating ?? null; // 매수|중립|관망
  const pickOnly = sp.pick === "1";

  const [{ data: reports }, { data: history }] = await Promise.all([
    getReports(200, { includeUnfit: includeUnfit || ratingFilter === "거래 부적합" }),
    getPickHistory(120),
  ]);
  // 픽 여부: 발행일+심볼 매칭 (픽 기록 = 모든 daily_focus 스냅샷)
  const pickKeys = new Set(history.map((h) => `${h.as_of}:${h.symbol}`));
  const latestDay = reports[0]?.as_of ?? null;

  // 필터 칩 카운트는 최신 발행일 기준
  const today = reports.filter((r) => r.as_of === latestDay);
  const counts = {
    전체: today.length,
    매수: today.filter((r) => r.rating === "매수").length,
    중립: today.filter((r) => r.rating === "중립").length,
    관망: today.filter((r) => r.rating === "관망").length,
    픽: today.filter((r) => pickKeys.has(`${r.as_of}:${r.symbol}`)).length,
  };

  // 필터 적용 → 날짜별 그룹 → 그룹 내 점수순
  let filtered = reports;
  if (ratingFilter) filtered = filtered.filter((r) => r.rating === ratingFilter);
  if (pickOnly)
    filtered = filtered.filter((r) => pickKeys.has(`${r.as_of}:${r.symbol}`));
  const groups = new Map<string, typeof filtered>();
  for (const r of filtered) {
    const g = groups.get(r.as_of) ?? [];
    g.push(r);
    groups.set(r.as_of, g);
  }
  for (const g of groups.values())
    g.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const chip = (
    label: string,
    href: string,
    active: boolean,
    accent = false,
  ) => (
    <Link
      key={label}
      href={href}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-accent bg-accent text-white"
          : accent
            ? "border-accent/30 bg-accent-dim text-accent hover:border-accent/60"
            : "border-border bg-surface text-text-dim hover:border-border-strong hover:text-text"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <AppShell
      title="종목 분석"
      subtitle="AI 애널리스트 — 오늘의 포커스는 이 리포트들에서 선정됩니다"
    >
      {/* 필터 바 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {chip(`전체 ${counts.전체}`, "/reports", !ratingFilter && !pickOnly)}
          {chip(`매수 ${counts.매수}`, "/reports?rating=매수", ratingFilter === "매수")}
          {chip(`중립 ${counts.중립}`, "/reports?rating=중립", ratingFilter === "중립")}
          {chip(`관망 ${counts.관망}`, "/reports?rating=관망", ratingFilter === "관망")}
          {chip(`⭐ 오늘의 픽 ${counts.픽}`, "/reports?pick=1", pickOnly, true)}
        </div>
        <Link
          href={includeUnfit ? "/reports" : "/reports?all=1"}
          className="text-2xs text-text-mute hover:text-text-dim"
        >
          {includeUnfit ? "거래 부적합 숨기기" : "거래 부적합 포함 보기"}
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="조건에 맞는 리포트가 없습니다." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([asOf, rows]) => {
            const pickCount = rows.filter((r) =>
              pickKeys.has(`${r.as_of}:${r.symbol}`),
            ).length;
            return (
              <section key={asOf}>
                <div className="mb-2 flex items-center gap-3">
                  <h2 className="text-sm font-extrabold">{fmtDateHeader(asOf)}</h2>
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-2xs font-medium text-text-dim">
                    {rows.length}건{pickCount > 0 && ` · 픽 ${pickCount}`}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {rows.map((r) => {
                    const isPick = pickKeys.has(`${r.as_of}:${r.symbol}`);
                    return (
                      <Link key={r.id} href={`/reports/${r.id}`} className="block">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Badge variant={ratingVariant(r.rating)} size="md">
                              {r.rating ?? "—"}
                            </Badge>
                            <span className="shrink-0 text-sm font-bold">
                              {r.name ?? r.title}
                            </span>
                            <span className="mono shrink-0 text-2xs text-text-mute">
                              {r.symbol}
                            </span>
                            {isPick && (
                              <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent-dim px-1.5 py-0.5 text-[10px] font-bold text-accent">
                                <Sparkles className="h-2.5 w-2.5" />
                                {r.as_of === latestDay ? "오늘의 픽" : "픽"}
                              </span>
                            )}
                            {r.summary && (
                              <span className="hidden truncate text-xs text-text-dim lg:inline">
                                {r.summary}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-4">
                            {r.score != null && (
                              <span className="flex items-baseline gap-1">
                                <span className="text-[10px] text-text-mute">종합</span>
                                <span
                                  className={`tnum text-sm font-extrabold ${
                                    r.score >= 65
                                      ? "text-bull"
                                      : r.score >= 45
                                        ? "text-warn"
                                        : "text-text-mute"
                                  }`}
                                >
                                  {r.score}
                                </span>
                              </span>
                            )}
                            {r.target_price != null && (
                              <span className="hidden items-baseline gap-1 sm:flex">
                                <span className="text-[10px] text-text-mute">목표</span>
                                <span className="tnum text-sm font-bold text-bull">
                                  {fmtPrice(r.target_price)}
                                </span>
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-text-mute" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <p className="text-center text-2xs text-text-mute">
            유사투자자문업자의 불특정 다수 대상 투자 참고 정보 · 투자 판단의 책임은
            투자자 본인에게 있습니다
          </p>
        </div>
      )}
    </AppShell>
  );
}
