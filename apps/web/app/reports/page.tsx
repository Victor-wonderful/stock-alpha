import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { getPickHistory, getReports } from "@/lib/data";

export const dynamic = "force-dynamic";

function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return <Badge variant="neutral" size="md">—</Badge>;
  if (rating === "매수") return <Badge variant="bull" size="md">{rating}</Badge>;
  if (rating === "중립") return <Badge variant="neutral" size="md">{rating}</Badge>;
  if (rating === "관망") return (
    <span className="inline-flex items-center rounded font-medium leading-none whitespace-nowrap px-2 py-0.5 text-2xs ring-1 ring-inset border border-border text-text-dim bg-transparent ring-border">
      {rating}
    </span>
  );
  if (rating === "거래 부적합") return <Badge variant="bear" size="md">{rating}</Badge>;
  return <Badge variant="neutral" size="md">{rating}</Badge>;
}

function fmtDateHeader(asOf: string): { date: string; weekday: string } {
  const [y, m, d] = asOf.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return { date: `${m}월 ${d}일`, weekday: days[wd] };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const includeUnfit = sp.all === "1";
  const ratingFilter = sp.rating ?? null;
  const activeMarket = sp.market ?? null; // KOSPI | KOSDAQ

  const FETCH_LIMIT = 400; // 일 발행 상한 100 × 며칠치 — 한도 도달 시 마지막(부분) 그룹은 버림
  const [{ data: fetched }, { data: history }] = await Promise.all([
    getReports(FETCH_LIMIT, { includeUnfit: includeUnfit || ratingFilter === "거래 부적합" }),
    getPickHistory(300),
  ]);

  // 조회 한도에 걸렸으면 가장 오래된 날짜 그룹이 중간에 잘렸을 수 있다 —
  // 부분 그룹을 건수가 맞는 양 표시하느니 그 날짜 전체를 숨긴다(정직성).
  let reports = fetched;
  if (fetched.length === FETCH_LIMIT) {
    const oldestDay = fetched[fetched.length - 1]?.as_of;
    reports = fetched.filter((r) => r.as_of !== oldestDay);
  }

  const pickKeys = new Set(history.map((h) => `${h.as_of}:${h.symbol}`));
  const latestDay = reports[0]?.as_of ?? null;

  // 필터 칩 카운트 (최신 발행일 기준)
  const today = reports.filter((r) => r.as_of === latestDay);
  const counts = {
    전체: today.length,
    매수: today.filter((r) => r.rating === "매수").length,
    중립: today.filter((r) => r.rating === "중립").length,
    관망: today.filter((r) => r.rating === "관망").length,
  };
  const unfitCount = reports.filter((r) => r.rating === "거래 부적합").length;

  // 필터 적용
  let filtered = reports;
  if (ratingFilter) filtered = filtered.filter((r) => r.rating === ratingFilter);
  // 거래소 필터 — 현재 ReportListItem 에 exchange 없음. symbol prefix 휴리스틱.
  // 실데이터에서는 instruments.exchange 가 있지만 리스트 뷰에는 미포함 — UI 칩만 노출

  // 날짜별 그룹 → 그룹 내 점수순
  const groups = new Map<string, typeof filtered>();
  for (const r of filtered) {
    const g = groups.get(r.as_of) ?? [];
    g.push(r);
    groups.set(r.as_of, g);
  }
  for (const g of groups.values()) g.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const buildHref = (key: string, val: string | null) => {
    const p = new URLSearchParams();
    if (activeMarket && key !== "market") p.set("market", activeMarket);
    if (includeUnfit) p.set("all", "1");
    if (val) p.set(key, val);
    const qs = p.toString();
    return qs ? `/reports?${qs}` : "/reports";
  };

  return (
    <AppShell
      title="종목 분석"
      subtitle="AI 애널리스트 — 수치는 전부 DB 근거(source_refs) · LLM은 서술만"
    >
      {/* 판정 탭 필 + 거래소 칩 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 판정 탭 */}
          {[
            { key: null, label: "전체", cnt: counts.전체 },
            { key: "매수", label: "매수", cnt: counts.매수 },
            { key: "중립", label: "중립", cnt: counts.중립 },
            { key: "관망", label: "관망", cnt: counts.관망 },
          ].map(({ key, label, cnt }) => {
            const isActive = ratingFilter === key;
            return (
              <Link
                key={label}
                href={buildHref("rating", key)}
                className={`inline-flex items-center gap-1 rounded-[999px] px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-accent text-[#0B0C10]"
                    : "border border-border bg-surface text-text-dim hover:border-border-strong hover:text-text"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive ? "bg-[#0B0C10]/20 text-[#0B0C10]" : "bg-surface-3 text-text-mute"
                  }`}
                >
                  {cnt}
                </span>
              </Link>
            );
          })}

          <div className="h-4 w-px bg-border" />

          {/* 거래소 칩 */}
          {[
            { key: null, label: "전체" },
            { key: "KOSPI", label: "KOSPI" },
            { key: "KOSDAQ", label: "KOSDAQ" },
          ].map(({ key, label }) => (
            <Link
              key={label}
              href={buildHref("market", key)}
              className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors ${
                activeMarket === key
                  ? "bg-surface-3 text-text ring-1 ring-border-strong"
                  : "text-text-mute hover:text-text-dim"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* 거래 부적합 토글 */}
        <Link
          href={includeUnfit ? "/reports" : "/reports?all=1"}
          className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors ${
            includeUnfit
              ? "bg-bad-soft text-bad ring-1 ring-bad/30"
              : "border border-border text-text-mute hover:border-border-strong hover:text-text-dim"
          }`}
        >
          거래 부적합 {unfitCount}건 {includeUnfit ? "숨기기" : "보이기"}
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="조건에 맞는 리포트가 없습니다." />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([asOf, rows]) => {
            const pickCount = rows.filter((r) => pickKeys.has(`${r.as_of}:${r.symbol}`)).length;
            const isLatest = asOf === latestDay;
            const { date, weekday } = fmtDateHeader(asOf);
            const VISIBLE = 10;
            const head = rows.slice(0, VISIBLE);
            const rest = rows.slice(VISIBLE);

            const renderRow = (r: (typeof rows)[number]) => {
              const isPick = pickKeys.has(`${r.as_of}:${r.symbol}`);
              return (
                <Link key={r.id} href={`/reports/${r.id}`} className="block">
                  <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-3">
                    {/* 판정 배지 */}
                    <RatingBadge rating={r.rating} />

                    {/* 종목명+코드+픽 배지 */}
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 text-[13px] font-bold text-text">
                        {r.name ?? r.title}
                      </span>
                      <span className="mono shrink-0 text-[10px] text-text-mute">
                        {r.symbol}
                      </span>
                      {isPick && (
                        <span className="shrink-0 rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                          ⭐ {isLatest ? "오늘의 픽" : "픽"}
                        </span>
                      )}
                      {r.summary && (
                        <span className="hidden truncate text-[11px] text-text-mute lg:block">
                          {r.summary}
                        </span>
                      )}
                    </div>

                    {/* 점수 + 셋업 힌트 + chevron */}
                    <div className="flex shrink-0 items-center gap-3">
                      {r.score != null && (
                        <span
                          className={`tnum text-sm font-extrabold ${
                            r.score >= 65
                              ? "text-good"
                              : r.score >= 45
                                ? "text-warn"
                                : "text-text-mute"
                          }`}
                        >
                          {r.score}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-text-mute" />
                    </div>
                  </div>
                </Link>
              );
            };

            return (
              <section key={asOf}>
                {/* 날짜 그룹 헤더 */}
                <div className="mb-2.5 flex items-center gap-2.5">
                  <h2 className="text-[13px] font-extrabold text-text">{date}</h2>
                  <span className="text-[11px] font-medium text-text-mute">({weekday})</span>
                  <span className="rounded-[6px] bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-dim ring-1 ring-inset ring-border">
                    {rows.length}건{pickCount > 0 && ` · 픽 ${pickCount}`}
                  </span>
                  {isLatest && (
                    <span className="rounded-[6px] bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                      최신 발행
                    </span>
                  )}
                  <div className="h-px flex-1 bg-border" />
                </div>

                <div className="space-y-1.5">{head.map(renderRow)}</div>

                {rest.length > 0 && (
                  <details className="group mt-2">
                    <summary className="cursor-pointer list-none rounded-[12px] border border-dashed border-border py-2.5 text-center text-xs font-semibold text-accent transition-colors hover:border-accent/50 hover:bg-accent-soft/40">
                      <span className="group-open:hidden">나머지 {rest.length}건 펼치기 ↓</span>
                      <span className="hidden group-open:inline">접기 ↑</span>
                    </summary>
                    <div className="mt-1.5 space-y-1.5">{rest.map(renderRow)}</div>
                  </details>
                )}
              </section>
            );
          })}

          <p className="text-center text-[11px] text-text-mute">
            유사투자자문업자의 불특정 다수 대상 투자 참고 정보 · 투자 판단의 책임은 투자자 본인에게 있습니다
          </p>
        </div>
      )}
    </AppShell>
  );
}
