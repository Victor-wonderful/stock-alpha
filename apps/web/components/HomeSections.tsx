import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { BlogPost, WeeklyReport } from "@/lib/data";
import type { MacroSeriesView, ReportListItem } from "@/lib/types";
import { SectionHead } from "@/components/SectionHead";

/* ────────────────────────────────────────────────────────────
   홈 하단 3섹션 — vecta-blog 홈의 「섹션 헤더 + 글 목록」 리듬 그대로.
   한 행은 날짜 · 굵은 제목 · 회색 한 줄 · 우측 읽는 시간이다.

   진열하는 글은 이 터미널이 만들지 않는다. vecta-blog 가 쓴 글을
   /posts.json 으로 받아 보여줄 뿐이다(lib/data.getBlogPosts).
   그래서 링크는 내부 라우트가 아니라 블로그의 절대 URL 이다.

   글이 아직 없는 섹션은 렌더하지 않는다. 「준비 중」 자리를 잡아두면
   빈 채로 몇 달을 서 있게 되고, 그건 없는 것보다 나쁘다.
   ──────────────────────────────────────────────────────────── */

/** 목록 URL — 글 URL(.../view/weekly/<slug>)에서 마지막 조각만 떼면 그 하위분류 페이지다.
 *  블로그 주소를 이 컴포넌트가 따로 알 필요가 없어진다. */
function sectionHref(posts: BlogPost[]): string | undefined {
  const u = posts[0]?.url;
  return u ? u.replace(/\/[^/]+$/, "") : undefined;
}

export function BlogPosts({ posts }: { posts: BlogPost[] }) {
  return (
    <ul className="mt-6 overflow-hidden rounded-[12px] border border-border bg-surface">
      {posts.map((p, i) => (
        <li key={p.url} className={i > 0 ? "border-t border-border-soft" : ""}>
          <a
            href={p.url}
            className="group flex items-center gap-5 px-5 py-4 transition-colors hover:bg-surface-2"
          >
            <span className="tnum w-[46px] shrink-0 text-[12px] text-text-mute">
              {p.publishedAt.slice(5).replace("-", ".")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-bold leading-[1.5] text-text group-hover:text-accent">
                {p.title}
              </p>
              <p className="mt-1 truncate text-[12.5px] leading-[1.6] text-text-mute">
                {p.summary}
              </p>
            </div>
            <span className="tnum shrink-0 text-[12px] text-text-mute">
              {p.readingMinutes}분
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** 엔진 주간 브리핑 행 — 블로그 글이 없을 때 이 자리를 채운다.
 *  제목은 그 주 측정값에서 규칙으로 뽑은 것이라 전부 과거형·실측이다.
 *  우측 메타는 읽는 시간이 아니라 그 주 시장 수익률 — 기계 요약에 "8분"은 거짓말이다. */
function WeeklyReportRows({ items }: { items: WeeklyReport[] }) {
  return (
    <ul className="mt-6 overflow-hidden rounded-[12px] border border-border bg-surface">
      {items.map((w, i) => (
        <li
          key={w.as_of}
          className={`flex items-center gap-5 px-5 py-4 ${
            i > 0 ? "border-t border-border-soft" : ""
          }`}
        >
          <span className="tnum w-[46px] shrink-0 text-[12px] text-text-mute">
            {w.as_of.slice(5).replace("-", ".")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-bold leading-[1.5] text-text">{w.title}</p>
            {w.summary && (
              <p className="mt-1 truncate text-[12.5px] leading-[1.6] text-text-mute">
                {w.summary}
              </p>
            )}
          </div>
          {w.market_ret != null && (
            <span
              className={`tnum shrink-0 text-[12.5px] font-semibold ${
                w.market_ret >= 0 ? "text-good" : "text-bad"
              }`}
            >
              {w.market_ret >= 0 ? "+" : ""}
              {(w.market_ret * 100).toFixed(1)}%
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 주간 브리핑 — 블로그 `view/weekly` 글. 없으면 엔진이 낸 주간 브리핑이 자리를 지킨다. */
export function WeeklyBriefs({
  posts,
  reports,
  // 홈에서는 「전체 보기 → /insights」. 인사이트 페이지 자신은 null 을 줘서 링크를 없앤다
  // (자기 자신을 가리키는 «전체 보기»는 막다른 길이다).
  moreHref = "/insights",
}: {
  posts: BlogPost[];
  reports: WeeklyReport[];
  moreHref?: string | null;
}) {
  const hasPosts = posts.length > 0;
  if (!hasPosts && reports.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHead
        title="주간 브리핑"
        href={moreHref ?? undefined}
      />
      {hasPosts ? <BlogPosts posts={posts} /> : <WeeklyReportRows items={reports} />}
    </section>
  );
}

// 지표가 «무엇인지»만 적는다. 「금리가 꺾이면 성장주가 좋다」 같은 해석은 쓰지 않는다 —
// 이 제품의 원칙은 측정한 것만 말하는 것이고, 저 문장은 측정한 적이 없다.
const MACRO_DESC: Record<string, string> = {
  DGS10: "미국 10년물 국채 금리 — 전 세계 자산 가격을 재는 할인율의 기준",
  VIXCLS: "S&P 500 옵션이 예상하는 30일 변동성 — 흔히 공포지수라 부른다",
  DCOILWTICO: "서부텍사스산 원유 — 정유·화학·항공·해운의 원가",
  DEXKOUS: "원달러 환율 — 외국인 수급과 수출 기업 실적의 전제",
};

/** 매크로 지표 행 — 글이 아직 없을 때 이 자리를 채운다. 행 형태는 글과 똑같다. */
function MacroRows({ items }: { items: MacroSeriesView[] }) {
  return (
    <ul className="mt-6 overflow-hidden rounded-[12px] border border-border bg-surface">
      {items.map((m, i) => {
        // 매크로는 '오르면 좋다'가 아니다 — VIX 는 오르면 나쁘다.
        // 좋고 나쁨이 아니라 방향만 칠한다(상승=적/하락=청).
        const up = m.change >= 0;
        return (
          <li
            key={m.series_id}
            className={`flex items-center gap-5 px-5 py-4 ${
              i > 0 ? "border-t border-border-soft" : ""
            }`}
          >
            <span className="tnum w-[46px] shrink-0 text-[12px] text-text-mute">
              {m.as_of ? m.as_of.slice(5).replace("-", ".") : "—"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-bold leading-[1.5] text-text">
                {m.label}{" "}
                <span className="tnum">
                  {m.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                  {m.unit}
                </span>
              </p>
              <p className="mt-1 truncate text-[12.5px] leading-[1.6] text-text-mute">
                {MACRO_DESC[m.series_id] ?? ""}
              </p>
            </div>
            <span
              className={`tnum shrink-0 text-[12.5px] font-semibold ${up ? "text-good" : "text-bad"}`}
            >
              {up ? "+" : ""}
              {m.change.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 매크로 — 블로그 `view/macro` 글. 글이 아직 없으면 같은 자리에 지표를 세운다.
 *  세 섹션은 홈의 뼈대라 하나가 통째로 빠지면 화면이 무너진다. 글이 생기면 글이 이긴다. */
export function MacroSection({
  posts,
  indicators,
  moreHref = "/insights",
}: {
  posts: BlogPost[];
  indicators: MacroSeriesView[];
  moreHref?: string | null;
}) {
  const hasPosts = posts.length > 0;
  if (!hasPosts && indicators.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHead
        title="매크로"
        href={moreHref ?? undefined}
      />
      {hasPosts ? <BlogPosts posts={posts} /> : <MacroRows items={indicators} />}
    </section>
  );
}

const RATING_VARIANT: Record<string, "bull" | "neutral" | "warn"> = {
  매수: "bull",
  중립: "neutral",
  관망: "warn",
};

/** 엔진 리포트 행 — 블로그 심층분석이 없을 때 이 자리를 채운다.
 *  블로그 글은 한 달에 한두 편이지만 이 리포트는 매일 100건씩 나온다. 자리를 비워두는 것보다
 *  매일 갱신되는 판정을 보여주는 게 낫다. 우측 메타는 읽는 시간 대신 판정과 점수. */
function ReportRows({ items }: { items: ReportListItem[] }) {
  return (
    <ul className="mt-6 overflow-hidden rounded-[12px] border border-border bg-surface">
      {items.map((r, i) => (
        <li key={r.id} className={i > 0 ? "border-t border-border-soft" : ""}>
          <Link
            href={`/reports/${r.id}`}
            className="group flex items-center gap-5 px-5 py-4 transition-colors hover:bg-surface-2"
          >
            <span className="tnum w-[46px] shrink-0 text-[12px] text-text-mute">
              {r.as_of.slice(5).replace("-", ".")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-bold leading-[1.5] text-text group-hover:text-accent">
                {r.name ?? r.title}
                {r.symbol && (
                  <span className="tnum ml-2 text-[11.5px] font-normal text-text-mute">
                    {r.symbol}
                  </span>
                )}
              </p>
              {r.summary && (
                <p className="mt-1 truncate text-[12.5px] leading-[1.6] text-text-mute">
                  {r.summary}
                </p>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-2.5">
              {r.rating && (
                <Badge variant={RATING_VARIANT[r.rating] ?? "neutral"} size="sm">
                  {r.rating}
                </Badge>
              )}
              {r.score != null && (
                <span className="tnum text-[12px] text-text-mute">{r.score.toFixed(1)}점</span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 최근 기업 분석 — 블로그 `stocks/analysis` 글. 없으면 엔진 리포트가 자리를 지킨다. */
export function RecentReports({
  posts,
  reports,
}: {
  posts: BlogPost[];
  reports: ReportListItem[];
}) {
  const hasPosts = posts.length > 0;
  if (!hasPosts && reports.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHead
        title="최근 기업 분석"
        href={hasPosts ? sectionHref(posts) : "/reports"}
        linkLabel={hasPosts ? "전체 보기" : "분석 전체"}
      />
      {hasPosts ? <BlogPosts posts={posts} /> : <ReportRows items={reports} />}
    </section>
  );
}
