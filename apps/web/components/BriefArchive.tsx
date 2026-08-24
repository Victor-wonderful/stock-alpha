import Link from "next/link";

import type { BlogPost, MorningBriefListItem } from "@/lib/data";
import { BlogPosts } from "@/components/HomeSections";
import { regimeName } from "@/components/RegimeHeader";
import { SectionHead } from "@/components/SectionHead";

/**
 * 「매일 브리프」 — 매 거래일 한 편씩 쌓인 장 마감 기록.
 *
 * 왜 만들었나(2026-08-24) — 브리프는 2026-06-10 부터 48편이 DB 에 있는데 로더가
 * **최신 1건만** 읽었다. 홈에 오늘 것 한 줄이 뜨고 끝이라, 어제 브리프조차 다시 읽을
 * 데가 없었다. 「읽을 것이 모이는 곳」이라면서 매일 나오는 유일한 글이 빠져 있었다.
 *
 * 행 모양은 주간 브리핑·블로그 행과 같다(날짜 · 제목 · 우측 수치). 우측 수치는
 * 읽는 시간이 아니라 **그날 시장 수익률**이다 — 기계 요약에 "8분"은 거짓말이다.
 * 다른 점은 국면 칩 하나뿐이고, 그건 그날 화면 전체의 전제였으므로 목록에 있어야 한다.
 *
 * 헤드라인이 이미 «오른 종목 403 / 내린 종목 1,949» 같은 완결 문장이라 회색 설명줄을
 * 따로 두지 않는다. 같은 사실을 두 줄로 말하지 않는다.
 */
export function BriefRows({ items }: { items: MorningBriefListItem[] }) {
  return (
    <ul className="mt-6 overflow-hidden rounded-[12px] border border-border bg-surface">
      {items.map((b, i) => {
        const rg = regimeName(b.market_state);
        // 배치가 안 돈 날 — 브리프가 아니라 «그날은 분석이 없다»는 기록이다.
        // 목록에서 지우지 않는다. 공백을 감추면 나중에 그 날을 «분석했는데 아무것도
        // 안 나온 날»로 오해한다.
        const outage = b.kind === "outage";
        return (
          <li key={b.as_of} className={i > 0 ? "border-t border-border-soft" : ""}>
            <Link
              href={`/insights/brief/${b.as_of}`}
              className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="tnum w-[46px] shrink-0 text-[12px] text-text-mute">
                {b.as_of.slice(5).replace("-", ".")}
              </span>
              <span
                className={`shrink-0 rounded-[999px] border px-2 py-0.5 text-[10.5px] font-semibold ${
                  outage
                    ? "border-border-strong bg-surface-2 text-text-mute"
                    : rg
                      ? rg.cls
                      : "border-border-strong bg-surface-2 text-text-mute"
                }`}
              >
                {outage ? "미발행" : (rg?.name ?? "국면 미상")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-bold leading-[1.5] text-text group-hover:text-accent">
                  {b.headline}
                </span>
                {/* 장 시작 전에 쓰는 글이라 월요일 브리프는 금요일 마감을 담는다.
                    그러면 목록에 같은 장이 두 번 서므로, 다를 때만 어느 장인지 적는다. */}
                {b.market_as_of && b.market_as_of !== b.as_of && (
                  <span className="tnum mt-0.5 block text-[11.5px] text-text-mute">
                    {b.market_as_of.slice(5).replace("-", ".")} 마감 기준
                  </span>
                )}
              </span>
              {b.market_ret != null ? (
                <span
                  className={`tnum shrink-0 text-[12.5px] font-semibold ${
                    b.market_ret >= 0 ? "text-good" : "text-bad"
                  }`}
                >
                  {b.market_ret >= 0 ? "+" : ""}
                  {(b.market_ret * 100).toFixed(1)}%
                </span>
              ) : (
                <span className="tnum shrink-0 text-[12.5px] text-text-mute">—</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 인사이트 페이지에 세우는 섹션.
 *
 * 2026-08-24 부터 엔진이 이 브리프를 **블로그 글로도 발행한다**(engine/daily).
 * 글이 있으면 글이 이긴다 — 이 저장소의 다른 섹션(주간 브리핑·매크로)과 같은 규칙이다.
 * 글로 읽는 편이 낫고, 블로그 쪽에는 본문(시황 문단·조건부 실측·지표 표)이 다 있다.
 *
 * 글이 없을 때만 표 형태 목록으로 되돌아간다 — 블로그가 안 떠 있어도 이 자리가
 * 비지 않아야 한다.
 */
export function BriefArchive({
  items,
  posts = [],
  moreHref,
}: {
  items: MorningBriefListItem[];
  /** 블로그의 engine/daily 글. 있으면 이쪽을 그린다. */
  posts?: BlogPost[];
  moreHref?: string | null;
}) {
  const hasPosts = posts.length > 0;
  if (!hasPosts && items.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHead
        title="매일 브리프"
        sub="장이 끝난 뒤 그날을 기록합니다. 전망이 아니라 끝난 장의 숫자와, 과거 같은 날들이 어떻게 됐는지입니다."
        href={moreHref ?? undefined}
        linkLabel={hasPosts ? "지난 브리프" : "지난 브리프 전체"}
      />
      {hasPosts ? <BlogPosts posts={posts} /> : <BriefRows items={items} />}
    </section>
  );
}
