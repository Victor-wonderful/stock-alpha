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
  getReports,
  getLatestPricesBySymbols,
} from "@/lib/data";
import { nextTradingDayLabel, tradingDayLabel } from "@/lib/format";
import { PUBLISH_HORIZONS } from "@/lib/holding";
import { PriceNow } from "@/components/PriceNow";
import { RowSubLink } from "@/components/RowSubLink";

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
  // ⚠️ 기본 보기에서는 부적합을 조회하지 않으므로 받아온 배열로는 0 이 나온다.
  // «몇 개를 숨겼는지»는 숨기는 쪽이 말해야 한다 — 따로 센다.
  const unfitCount = includeUnfit
    ? reports.filter((r) => r.as_of === latestDay && r.rating === "거래 부적합").length
    : await countUnfitReports(latestDay);
  // 숨긴 것 중 «지금 기준으로는 발행 대상»인 수. 판정이 리포트를 만든 날 기준이라
  // 게이트가 바뀐 뒤로 어긋난다 — 목록이 살 수 있는 종목을 가리고 있을 수 있다.
  const unfitPublishable = await countUnfitButPublishable(latestDay, PUBLISH_HORIZONS);

  // 필터 적용
  let filtered = reports;
  if (ratingFilter) filtered = filtered.filter((r) => r.rating === ratingFilter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (r) => (r.name ?? "").toLowerCase().includes(q) || (r.symbol ?? "").includes(q),
    );
  }
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

  // 현재가 — 렌더되는 종목 전부를 벌크 1회로 가져온다.
  const priceMap = await getLatestPricesBySymbols(
    filtered.map((r) => r.symbol).filter((s): s is string => !!s),
  );

  const buildHref = (key: string, val: string | null) => {
    const p = new URLSearchParams();
    if (activeMarket && key !== "market") p.set("market", activeMarket);
    if (includeUnfit) p.set("all", "1");
    if (search) p.set("q", search);
    if (val) p.set(key, val);
    const qs = p.toString();
    return qs ? `/reports?${qs}` : "/reports";
  };

  return (
    <AppShell
      // 메뉴 이름과 맞춘다 — 「분석」(2026-08-22). «종목»은 대상이지 화면이 하는 일이
      // 아니다. 여기서 하는 일은 종목을 고르는 게 아니라 «판단을 읽는» 것이다.
      title="분석"
      asOf={latestDay ? `${tradingDayLabel(latestDay)} 기준` : null}
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
        <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-5 py-4 focus-within:border-accent">
          <Search className="h-5 w-5 shrink-0 text-text-mute" />
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="종목명 또는 코드로 검색 — 예: 삼성전자, 005930"
            className="flex-1 bg-transparent text-[15px] text-text placeholder:text-text-mute focus:outline-none"
          />
          <span className="hidden shrink-0 text-[11px] text-text-mute sm:block">
            클릭 → 종목 상세 (5축·알파존·AI 리포트)
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
          <Link href="/reports?all=1" className="font-semibold text-accent hover:underline">
            숨긴 것까지 보기 →
          </Link>
        </div>
      )}

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
              // 종목명을 누르면 «종목 상세»로 간다 — 스크리너·오늘의 픽·진행 중과 같은
              // 자리다(2026-08-23 Victor: "분석에서 클릭하는 거랑 스크리너에서 클릭하는 게
              // 왜 다른 화면이 되나"). 예전에는 이 행 전체가 /reports/{id} 로 가서, 같은
              // 종목을 어디서 눌렀느냐에 따라 5축·알파존·수급이 있는 화면과 리포트 본문이
              // 갈렸다. 리포트는 종목 상세의 «한 부분»이므로 별도 링크로 뺀다.
              return (
                <div key={r.id} className="block">
                  {/* stretched link — 행 전체를 누를 수 있게 하되 마크업은 유효하게.
                      `<a>` 안에 버튼(종목코드 복사·리포트 →)을 넣으면 명세 위반이고
                      스크린리더가 링크 안의 버튼을 제대로 읽지 못한다. 그래서 링크는
                      종목명 하나에만 걸고, ::after 로 행 전체를 덮는다. 다른
                      상호작용 요소는 z-10 으로 그 위에 올린다. */}
                  <div className="relative flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-3">
                    {/* 판정 배지 */}
                    <RatingBadge rating={r.rating} />

                    {/* 종목명+코드+픽 배지 */}
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Link
                        href={`/stocks/${r.symbol}`}
                        className="shrink-0 text-[13px] font-bold text-text after:absolute after:inset-0 after:content-[''] hover:text-accent"
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
                      {/* 리포트 본문으로 바로 가는 길은 남긴다 — 종목 상세 안에도
                          「전체 리포트 →」가 있지만, 판정을 읽으러 온 사람은 한 번에
                          가고 싶다. 행 링크 안의 링크라 클릭을 여기서 멈춘다. */}
                      <RowSubLink
                        href={`/reports/${r.id}`}
                        className="relative z-10 hidden text-[11px] font-semibold text-accent sm:block"
                      >
                        리포트 →
                      </RowSubLink>
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
          })}

          <p className="text-center text-[11px] text-text-mute">
            유사투자자문업자의 불특정 다수 대상 투자 참고 정보 · 투자 판단의 책임은 투자자 본인에게 있습니다
          </p>
        </div>
      )}
    </AppShell>
  );
}
