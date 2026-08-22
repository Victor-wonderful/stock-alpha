import type { TopNewsItem } from "@/lib/data";
import { SectionHead } from "@/components/SectionHead";

/**
 * 홈 「오늘 주요 뉴스」 — **증시 전체를 움직인 기사**. 매크로 자리를 대신한다.
 *
 * 매크로는 FRED 시리즈라 발표가 3~4일 늦어 «매일 브리핑»이 되지 못했고, 3줄 중 2줄이
 * 상단 티커와 같은 값이었다. 매크로 자체는 인사이트(/insights)에 남는다.
 *
 * ⚠️ 개별 기업 뉴스가 아니다(2026-08-23 Victor — "증시에 영향을 미치는 그런 뉴스,
 * 금리 변동이라든지"). 첫 판은 종목별 기업 뉴스(신약 개발·수주)를 뽑아 어긋났다.
 * 지금은 lib/data.getTopNews 가 «여러 종목에 동시에 걸린 기사» + «제목의 시장 키워드»
 * 로 시황 기사만 고른다. 그래서 행에 종목명이 아니라 **주제 칩**(금리·환율·외국인 …)
 * 이 붙는다.
 *
 * ⚠️ 뉴스는 매수 신호가 아니다(PEAD 실측 -0.02). «무엇이 시장을 움직였나»를 보는
 * 자리이지 «무엇을 사라»가 아니다 — 그래서 픽 옆이 아니라 읽는 구역에 둔다.
 *
 * 제목·매체·원문 링크를 그대로 쓴다 — news 테이블이 url(네이버 금융)을 갖고 있어
 * 출처로 되돌아갈 수 있다.
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
          최근 이틀간 시장 전체에 걸리는 기사가 없습니다.
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
                  <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-text-mute">
                    <span>{n.source}</span>
                    {/* 왜 «시장 뉴스»로 골렸는지 — 제목에서 잡힌 키워드를 그대로 보인다.
                        고르는 규칙이 화면에 드러나야 목록을 믿을 수 있다. */}
                    {n.topics.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="rounded-[4px] bg-accent-soft px-1.5 py-px font-semibold text-accent"
                      >
                        {t}
                      </span>
                    ))}
                    {n.breadth > 1 && (
                      <span className="rounded-[4px] bg-surface-3 px-1.5 py-px text-text-dim">
                        {n.breadth}개 종목
                      </span>
                    )}
                  </span>
                  {/* ── 그 주제의 «지금 값» ──
                      2026-08-23 Victor 요청("증시에 어떤 영향을 미칠지"). 다만 «그래서
                      오를 것»은 쓰지 않는다 — 이 제품은 측정한 것만 말하고, 뉴스와
                      주가의 상관은 재봤을 때 거의 없었다(PEAD -0.02).
                      해석 대신 «그 기사가 말하는 지표가 지금 얼마인가»를 붙인다.
                      과거 빈도(「금리가 내린 날 다음 거래일 코스피가 오른 비율」)까지
                      붙이려면 엔진이 새로 재야 한다 — 미완. */}
                  {n.gauges.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {n.gauges.map((g) => (
                        <span
                          key={g.label}
                          className="tnum flex items-baseline gap-1.5 text-[11px]"
                        >
                          <span className="text-text-mute">{g.label}</span>
                          <span className="font-semibold text-text">{g.value}</span>
                          <span className={g.up ? "text-good" : "text-bad"}>
                            {g.change}
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-text-mute">
        지수·금리·환율·수급처럼 시장 전체에 걸리는 기사만 골랐습니다 · 뉴스는 매수
        신호가 아닙니다(실적 발표 후 주가 흐름을 재봤을 때 상관이 거의 없었습니다)
      </p>
    </section>
  );
}
