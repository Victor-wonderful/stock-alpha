import type { BlogPost } from "@/lib/data";
import type { MacroSeriesView } from "@/lib/types";
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

function PostRows({ posts }: { posts: BlogPost[] }) {
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

/** 주간 브리핑 — 블로그 `view/weekly`. 매주 한 편. */
export function WeeklyBriefs({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHead title="주간 브리핑" href={sectionHref(posts)} />
      <PostRows posts={posts} />
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
}: {
  posts: BlogPost[];
  indicators: MacroSeriesView[];
}) {
  const hasPosts = posts.length > 0;
  if (!hasPosts && indicators.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHead
        title="매크로"
        href={hasPosts ? sectionHref(posts) : "/market"}
        linkLabel={hasPosts ? "전체 보기" : "시장 전체"}
      />
      {hasPosts ? <PostRows posts={posts} /> : <MacroRows items={indicators} />}
    </section>
  );
}

/** 최근 기업 분석 — 블로그 `stocks/analysis`. */
export function RecentReports({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHead title="최근 기업 분석" href={sectionHref(posts)} />
      <PostRows posts={posts} />
    </section>
  );
}
