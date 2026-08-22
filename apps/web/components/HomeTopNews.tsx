import type { TopNewsItem } from "@/lib/data";
import { SectionHead } from "@/components/SectionHead";

/**
 * 홈 「오늘 주요 뉴스」 — 매크로 자리를 대신한다(2026-08-23 Victor).
 *
 * 매크로는 FRED 시리즈라 발표가 3~4일 늦어 «매일 브리핑»이 되지 못했고, 3줄 중 2줄이
 * 상단 티커와 같은 값이었다. 뉴스는 매 거래일 들어오고 티커와 겹치지 않는다.
 * 매크로 자체는 인사이트(/insights)에 남는다.
 *
 * ⚠️ 뉴스는 매수 신호가 아니다(PEAD 실측 -0.02). 이 목록은 «오늘 무엇이 화제였나»이지
 * «무엇을 사라»가 아니다. 그래서 픽·시그널과 나란히 두지 않고 읽는 구역에 둔다.
 *
 * 제목·매체·원문 링크를 그대로 쓴다 — news 테이블이 url(네이버 금융)을 갖고 있어
 * 출처로 되돌아갈 수 있다. components/RecentCoverage 가 제목을 안 쓰는 건 url 이 없던
 * 시절의 규약이라, 링크가 있는 여기서는 적용되지 않는다.
 */
function timeLabel(iso: string): string {
  // 저장은 UTC, 읽는 사람은 KST. +9 해서 시:분만 보여준다.
  const d = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  const mm = String(d.getUTCMonth() + 1);
  const dd = String(d.getUTCDate());
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export function HomeTopNews({ items }: { items: TopNewsItem[] }) {
  return (
    <section>
      {/* 부제를 달지 않는다. 옆 칸(주간 브리핑·최근 기업 분석)의 SectionHead 는
          부제가 없어서, 여기만 한 줄 높아지면 목록 시작선이 24px 어긋난다
          (2026-08-23 Victor — "좌우의 위치가 이상하다"). 설명은 목록 아래 각주로. */}
      <SectionHead title="오늘 주요 뉴스" href="/market" linkLabel="시장" />
      {items.length === 0 ? (
        <p className="mt-6 rounded-[12px] border border-border bg-surface px-5 py-8 text-center text-[13px] text-text-mute">
          최근 이틀간 수집된 기사가 없습니다.
        </p>
      ) : (
        <ul className="mt-6 overflow-hidden rounded-[12px] border border-border bg-surface">
          {items.map((n, i) => (
            <li key={n.id} className={i > 0 ? "border-t border-border-soft" : ""}>
              {/* 원문은 외부(네이버 금융)라 next/link 가 아니라 평범한 a 로 나간다. */}
              <a
                href={n.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
              >
                <span className="tnum w-[76px] shrink-0 pt-0.5 text-[11px] text-text-mute">
                  {timeLabel(n.publishedAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold leading-[1.5] text-text group-hover:text-accent">
                    {n.headline}
                  </span>
                  <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] text-text-mute">
                    <span>{n.source}</span>
                    {n.name && (
                      <>
                        <span className="opacity-50">·</span>
                        <span className="text-text-dim">{n.name}</span>
                      </>
                    )}
                    {n.articleCount > 1 && (
                      <span className="rounded-[4px] bg-surface-3 px-1.5 py-px font-semibold text-text-dim">
                        기사 {n.articleCount}건
                      </span>
                    )}
                  </span>
                </span>
                {n.symbol && (
                  <span className="shrink-0 pt-0.5">
                    {/* 종목 상세는 내부 라우트다 — 바깥 a 안에 a 를 중첩할 수 없어
                        시각적으로만 링크처럼 두고 실제 이동은 바깥(원문)이 맡는다. */}
                    <span className="tnum text-[11px] text-text-mute">{n.symbol}</span>
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-text-mute">
        같은 종목을 여러 매체가 다룬 순 · 종목당 대표 기사 한 건 · 뉴스는 매수 신호가
        아닙니다(실적 발표 후 주가 흐름을 재봤을 때 상관이 거의 없었습니다)
      </p>
    </section>
  );
}
