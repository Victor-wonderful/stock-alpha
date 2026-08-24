import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";
import { ChevronRight, Search } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import {
  countUnfitButPublishable,
  countUnfitReports,
  getPickHistory,
  getReportDays,
  getReports,
  getLatestPricesBySymbols,
} from "@/lib/data";
import { nextTradingDayLabel, tradingDayLabel } from "@/lib/format";
import { PUBLISH_HORIZONS } from "@/lib/holding";
import { PriceNow } from "@/components/PriceNow";

// force-dynamic 제거(2026-08-15): 이 플래그는 fetch 캐시까지 강제로 끈다
// (fetchCache: force-no-store). 데이터는 하루 두 번 배치로만 바뀌는데도 매 클릭마다
// 모든 쿼리를 다시 돌아 페이지 전환이 2~4초였다. 신선도는 이제 공개 클라이언트의
// 60초 fetch 캐시가 담당한다(lib/supabase/public.ts).

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
  const search = sp.q ?? ""; // 종목 검색(이름·코드)

  // ── 날짜가 곧 페이지다(2026-08-25) ──
  // 예전에는 한 번에 400건을 긁어 3일치를 한 장에 쌓았다. 실제로는 42개 발행일 ×
  // 하루 100건이라 **나머지 39일은 화면에서 갈 길이 없었다.** 게다가 판정 칩의 숫자는
  // 최신일 기준인데 목록은 3일치여서, 「매수 27」을 누르면 100건 넘게 나왔다.
  //
  // 하루치만 본다. 그러면 목록 길이가 발행일 수와 무관하게 일정하고, 칩의 숫자가
  // 화면에 보이는 것과 정확히 같아진다.
  const days = await getReportDays();
  const requested = sp.date ?? null;
  // 없는 날짜를 주소로 받으면 최신으로 되돌린다 — 빈 화면 대신 무언가를 보여준다.
  const day =
    requested && days.some((d) => d.asOf === requested)
      ? requested
      : (days[0]?.asOf ?? null);
  const dayIndex = days.findIndex((d) => d.asOf === day);
  // 목록은 최신이 위라, «이전 발행일»은 배열의 뒤쪽이다.
  const prevDay = dayIndex >= 0 ? (days[dayIndex + 1]?.asOf ?? null) : null;
  const nextDay = dayIndex > 0 ? days[dayIndex - 1].asOf : null;

  const [{ data: fetched }, { data: history }] = await Promise.all([
    // 하루 상한이 100건이라 200이면 넉넉하다. 날짜를 못 정했으면(발행 0건) 조회하지 않는다.
    day
      ? getReports(200, {
          day,
          includeUnfit: includeUnfit || ratingFilter === "거래 부적합",
        })
      : Promise.resolve({ data: [], isSample: false }),
    getPickHistory(300),
  ]);

  const reports = fetched;
  const pickKeys = new Set(history.map((h) => `${h.as_of}:${h.symbol}`));
  const latestDay = days[0]?.asOf ?? null;

  // ── 칩 카운트 ──
  // 보고 있는 날짜 기준이고, **시장 칩과 검색어를 반영한다.** 예전에는 판정 칩이
  // 필터와 무관한 수를 적고 있어서, KOSDAQ 을 고른 뒤에도 「매수 27」이 그대로였다.
  const inMarket = (r: (typeof reports)[number]) =>
    !activeMarket || r.exchange === activeMarket;
  const q = search.toLowerCase();
  const inSearch = (r: (typeof reports)[number]) =>
    !search ||
    (r.name ?? "").toLowerCase().includes(q) ||
    (r.symbol ?? "").includes(q);
  const base = reports.filter((r) => inMarket(r) && inSearch(r));
  const counts = {
    전체: base.length,
    매수: base.filter((r) => r.rating === "매수").length,
    중립: base.filter((r) => r.rating === "중립").length,
    관망: base.filter((r) => r.rating === "관망").length,
  };
  // ⚠️ 기본 보기에서는 부적합을 조회하지 않으므로 받아온 배열로는 0 이 나온다.
  // «몇 개를 숨겼는지»는 숨기는 쪽이 말해야 한다 — 따로 센다.
  const unfitCount = includeUnfit
    ? reports.filter((r) => r.rating === "거래 부적합").length
    : await countUnfitReports(day);
  // 숨긴 것 중 «지금 기준으로는 발행 대상»인 수. 판정이 리포트를 만든 날 기준이라
  // 게이트가 바뀐 뒤로 어긋난다 — 목록이 살 수 있는 종목을 가리고 있을 수 있다.
  const unfitPublishable = await countUnfitButPublishable(day, PUBLISH_HORIZONS);

  // ── 필터 적용 ──
  // 시장 칩은 여태 **눌러도 아무 일도 안 했다**(2026-08-25 발견). 목록 데이터에
  // exchange 가 없어서 필터를 걸 수가 없었고, 칩은 활성 표시만 바뀌었다. 이제
  // getReports 가 instruments.exchange 를 같이 받아온다.
  let filtered = base;
  if (ratingFilter) filtered = filtered.filter((r) => r.rating === ratingFilter);
  // 그날 점수순 — 날짜가 하나이므로 그룹을 나눌 필요가 없다.
  const rows = [...filtered].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  // 현재가 — 렌더되는 종목 전부를 벌크 1회로 가져온다.
  const priceMap = await getLatestPricesBySymbols(
    rows.map((r) => r.symbol).filter((s): s is string => !!s),
  );

  /**
   * 칩·날짜 링크의 주소. **보고 있는 조건을 잃지 않는 것**이 이 함수가 하는 일이다 —
   * 8/19 를 보다가 KOSDAQ 을 누르면 8/19 의 KOSDAQ 이어야지 최신일로 튕기면 안 된다.
   * 판정(rating)은 일부러 안 싣는다: 다른 축을 바꾸면 판정은 「전체」로 돌아간다.
   */
  const buildHref = (key: string, val: string | null) => {
    const p = new URLSearchParams();
    if (activeMarket && key !== "market") p.set("market", activeMarket);
    // 지금 바꾸는 축은 이월하지 않는다 — 그러지 않으면 「숨기기」를 눌러도 all=1 이
    // 그대로 따라붙어 토글이 한 방향으로만 움직인다.
    if (includeUnfit && key !== "all") p.set("all", "1");
    if (search) p.set("q", search);
    // 최신일은 주소에 싣지 않는다 — /reports 가 언제나 «가장 최근 분석»이어야 한다.
    if (day && day !== latestDay && key !== "date") p.set("date", day);
    if (val) p.set(key, val);
    const qs = p.toString();
    return qs ? `/reports?${qs}` : "/reports";
  };

  return (
    <AppShell
      // 메뉴 이름과 맞춘다 — 「분석」(2026-08-22). «종목»은 대상이지 화면이 하는 일이
      // 아니다. 여기서 하는 일은 종목을 고르는 게 아니라 «판단을 읽는» 것이다.
      title="분석"
      // 최신일이 아니라 **보고 있는 날짜**를 적는다. 8/19 를 열어 놓고 머리에 8/24 가
      // 적혀 있으면 화면이 자기 자신과 다른 말을 한다.
      asOf={day ? `${tradingDayLabel(day)} 기준` : null}
      subtitle="종목별 판단을 읽는 곳입니다. 검색하거나 목록에서 누르면 종목 상세(5축·알파존·리포트)로 갑니다."
      stats={[
        // 「오늘의 픽」의 「분석 179」와 같은 수를 말해야 한다 — 같은 날 같은 대상인데
        // 두 메뉴가 다른 수를 적으면 어느 쪽이 틀렸는지 되묻게 된다. 목록에 보이는
        // 건수(152)가 아니라 그날 분석한 전부(152 + 숨긴 27)를 적는다.
        { label: "분석 종목", value: `${counts.전체 + (includeUnfit ? 0 : unfitCount)}` },
        { label: "매수 판정", value: `${counts.매수}` },
        // 이 화면이 숨기고 있는 것을 머리에서 먼저 밝힌다 — 목록에 안 보이는 수다.
        { label: "기본 숨김", value: `${unfitCount}`, tone: "accent" as const },
      ]}
    >
      {/* 종목 검색 바 (검색·분석 허브 진입점, IA 2026-06-24) */}
      <form method="get" action="/reports" className="mb-4">
        {ratingFilter && <input type="hidden" name="rating" value={ratingFilter} />}
        {activeMarket && <input type="hidden" name="market" value={activeMarket} />}
        {includeUnfit && <input type="hidden" name="all" value="1" />}
        {/* 검색해도 보던 날짜를 잃지 않는다 */}
        {day && day !== latestDay && <input type="hidden" name="date" value={day} />}
        <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-5 py-4 focus-within:border-accent">
          <Search className="h-5 w-5 shrink-0 text-text-mute" />
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="종목명 또는 코드로 검색 — 예: 삼성전자, 005930"
            className="flex-1 bg-transparent text-[15px] text-text placeholder:text-text-mute focus:outline-none"
          />
          {/* 한 행에 목적지가 둘이라 그걸 밝힌다 — 안 적으면 종목명을 눌렀을 때
              «왜 리포트가 아니지»가 된다. */}
          <span className="hidden shrink-0 text-[11px] text-text-mute sm:block">
            행 클릭 → 분석 리포트 · <span className="text-text-dim">종목명</span> 클릭 → 종목 상세
          </span>
        </div>
      </form>

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
                    ? "bg-accent text-text-on-accent"
                    : "border border-border bg-surface text-text-dim hover:border-border-strong hover:text-text"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive ? "bg-black/20 text-text-on-accent" : "bg-surface-3 text-text-mute"
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
          href={buildHref("all", includeUnfit ? null : "1")}
          className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors ${
            includeUnfit
              ? "bg-bad-soft text-bad ring-1 ring-bad/30"
              : "border border-border text-text-mute hover:border-border-strong hover:text-text-dim"
          }`}
        >
          거래 부적합 {unfitCount}건 {includeUnfit ? "숨기기" : "보이기"}
        </Link>
      </div>

      {/* 숨긴 것 중에 «지금 살 수 있는» 종목이 섞여 있으면 반드시 말한다.
          판정(rating)은 리포트를 만든 날의 거래가능 게이트를 점수 위에 덧씌운 값이라,
          게이트가 (셋업 × 기간) 축으로 바뀐 뒤로 어긋난다. 2026-08-23 실측 — 8/21 자
          부적합 27건 중 9건이 지금 게이트에서 발행 대상 조합을 갖고 있었고, 그중 하나가
          그날 실제로 발행된 픽(오리온)이다. 화면이 무언가를 숨긴다면 무엇을 숨겼는지는
          말해야 한다. */}
      {!includeUnfit && unfitPublishable > 0 && (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-[12px] leading-relaxed text-text-dim">
          <span className="font-bold text-warn">
            숨긴 {unfitCount}건 중 {unfitPublishable}건은 지금 기준으로 발행 대상입니다
          </span>
          <span>
            — 「거래 부적합」은 리포트를 만든 날의 게이트로 찍힌 값이라 그 뒤 게이트가
            바뀌면 어긋납니다. 실제로 「오늘의 픽」에 오른 종목이 여기 들어 있습니다.
          </span>
          <Link href={buildHref("all", "1")} className="font-semibold text-accent hover:underline">
            숨긴 것까지 보기 →
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState message="조건에 맞는 리포트가 없습니다." />
      ) : (
        <div className="space-y-6">
          {(() => {
            const asOf = day!;
            const pickCount = rows.filter((r) => pickKeys.has(`${r.as_of}:${r.symbol}`)).length;
            const isLatest = asOf === latestDay;
            const { date, weekday } = fmtDateHeader(asOf);
            const VISIBLE = 10;
            const head = rows.slice(0, VISIBLE);
            const rest = rows.slice(VISIBLE);

            const renderRow = (r: (typeof rows)[number]) => {
              const isPick = pickKeys.has(`${r.as_of}:${r.symbol}`);
              // 목적지가 둘이다 — 한 행에서 둘 다 갈 수 있어야 한다(2026-08-23 Victor).
              //   행 아무 데나  → 리포트 본문.  이 페이지 이름이 「분석」이고 행에 판정·
              //                   점수·요약이 실려 있다. 그걸 더 읽으려고 누르는 것이다.
              //   종목명        → 종목 상세.  종목명은 어느 화면에서 눌러도 같은 자리로
              //                   가야 한다(스크리너·오늘의 픽·진행 중과 동일).
              //
              // 한 번 «행 전체 → 종목 상세»로 바꿔 봤다가 되돌렸다. 그러면 판정을 읽으러
              // 온 사람이 종목 화면을 한 번 거쳐야 하고, 리포트는 이 페이지의 주인공인데
              // 곁가지가 된다. 종목 상세로 가는 길은 종목명 하나로 충분하다.
              return (
                <div key={r.id} className="block">
                  {/* stretched link — 행 전체가 리포트로 간다. 링크 안에 버튼을 넣으면
                      명세 위반이라, 행을 덮는 «보이지 않는 링크»를 z-0 으로 깔고
                      종목명·코드는 z-10 으로 그 위에 올린다. */}
                  <div className="relative flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-3">
                    <Link href={`/reports/${r.id}`} className="absolute inset-0 z-0">
                      <span className="sr-only">{r.name ?? r.title} 분석 리포트 열기</span>
                    </Link>

                    {/* 판정 배지 */}
                    <RatingBadge rating={r.rating} />

                    {/* 종목명+코드+픽 배지 */}
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Link
                        href={`/stocks/${r.symbol}`}
                        className="relative z-10 shrink-0 text-[13px] font-bold text-text hover:text-accent hover:underline"
                        title={`${r.name ?? ""} 종목 상세 — 5축·알파존·밸류·수급`}
                      >
                        {r.name ?? r.title}
                      </Link>
                      <SymbolCode
                        symbol={r.symbol}
                        className="relative z-10 shrink-0 text-[10px] text-text-mute"
                      />
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
                      {/* 현재가 — 종목 허브에 지금 주가가 없으면 판정만 보고 나가야 한다. */}
                      <span className="hidden text-right sm:block">
                        <PriceNow
                          close={r.symbol ? priceMap.get(r.symbol)?.close : undefined}
                          changePct={r.symbol ? priceMap.get(r.symbol)?.changePct : undefined}
                          date={r.symbol ? priceMap.get(r.symbol)?.date : undefined}
                          size="xs"
                        />
                      </span>
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
                </div>
              );
            };

            return (
              <section key={asOf}>
                {/* 날짜 그룹 헤더 */}
                <div className="mb-2.5 flex items-center gap-2.5">
                  <h2 className="text-[13px] font-extrabold text-text">{date}</h2>
                  <span className="text-[11px] font-medium text-text-mute">({weekday}) 종가</span>
                  <span className="text-[10px] font-medium text-text-mute">
                    → {nextTradingDayLabel(asOf)} 장전 플랜
                  </span>
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
          })()}

          {/* 날짜 이동 — 이 목록의 «다음 페이지»다. 42개 발행일을 한 장에 쌓지 않고
              하루씩 넘긴다(2026-08-25). 이전/다음이 없으면 버튼 자리를 비워 둔다 —
              눌러도 아무 데도 안 가는 버튼을 두느니 없는 게 낫다. */}
          <nav
            className="flex items-center justify-between gap-3 border-t border-border pt-5"
            aria-label="발행일 이동"
          >
            {prevDay ? (
              <Link
                href={buildHref("date", prevDay)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-[9px] border border-border px-4 text-[12.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
              >
                ← {fmtDateHeader(prevDay).date}
              </Link>
            ) : (
              <span className="text-[11.5px] text-text-mute">가장 오래된 발행일입니다</span>
            )}

            <span className="text-[11.5px] text-text-mute">
              발행일 {dayIndex + 1} / {days.length}
            </span>

            {nextDay ? (
              <Link
                href={buildHref("date", nextDay)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-[9px] border border-border px-4 text-[12.5px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
              >
                {fmtDateHeader(nextDay).date} →
              </Link>
            ) : (
              <span className="text-[11.5px] text-text-mute">최신 발행일입니다</span>
            )}
          </nav>

          <p className="text-center text-[11px] text-text-mute">
            유사투자자문업자의 불특정 다수 대상 투자 참고 정보 · 투자 판단의 책임은 투자자 본인에게 있습니다
          </p>
        </div>
      )}
    </AppShell>
  );
}
