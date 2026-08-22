import Link from "next/link";

import { getNewsEvents, getRecommendations } from "@/lib/data";
import { fmtPct } from "@/lib/format";

/**
 * 최근 보도 — 「이 종목에 사건이 있었나」.
 *
 * 기사 제목·본문을 쓰지 않는다(언론사 저작물). 외부로 나가는 링크도 없다.
 * '같은 날 여러 매체가 동시에 다뤘다'는 사실만 세고, 그 옆에 VECTA 가 실제로 잰
 * 그날 등락을 붙인다. 조용한 종목은 조용하다고 적는다 — 그것도 정보다.
 *
 * 2026-08-22 에 홈에서 «시장»으로 옮겼다. 홈을 추천 화면으로 바꾸면서(IA 1단계)
 * 홈에만 있던 섹션은 이게 유일했다. 보도는 종목 판단이 아니라 «맥락»이라 시장이 제자리다
 * (뉴스는 매수 신호가 아니다 — PEAD 실측 -0.02).
 *
 * 네이비 = 기계가 센 데이터. 그 위에서는 시세 적/청을 그대로 못 쓴다(대비 2.1~2.4:1)
 * — up-on-navy/down-on-navy 를 쓴다.
 */
export async function RecentCoverage({ limit = 5 }: { limit?: number }) {
  const recs = await getRecommendations();
  const picks = recs.data.slice(0, limit);
  if (picks.length === 0) return null;

  const eventMap = await getNewsEvents(
    picks.map((p) => p.symbol),
    { minOutlets: 2, days: 10 },
  );

  return (
    <section className="mb-5 rounded-[12px] bg-navy p-5">
      <h2 className="mb-2 flex items-baseline gap-2 text-sm font-bold text-on-navy">
        최근 보도
        <span className="text-[11px] font-medium text-on-navy-3">
          추천 종목 · 최근 10일 · 같은 날 2개 매체 이상 다룬 건만
        </span>
      </h2>
      <div className="divide-y divide-on-navy/10">
        {picks.map((p) => {
          const evs = eventMap.get(p.symbol) ?? [];
          return (
            <div key={p.symbol} className="flex flex-wrap items-baseline gap-x-3 py-2">
              <Link
                href={`/stocks/${p.symbol}`}
                className="w-[120px] shrink-0 truncate text-[16px] font-semibold text-on-navy transition-colors hover:text-accent-on-navy"
              >
                {p.name}
              </Link>
              {evs.length === 0 ? (
                <span className="text-[11px] text-on-navy-3">눈에 띄는 보도 없음</span>
              ) : (
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                  {evs.slice(0, 3).map((e) => (
                    <span key={e.date} className="flex items-baseline gap-1.5">
                      <span className="tnum text-[11px] text-on-navy-3">
                        {e.date.slice(5).replace("-", "/")}
                      </span>
                      <span className="rounded-[4px] border border-on-navy/25 px-1.5 py-px text-[11px] font-semibold text-on-navy-2">
                        {e.outletCount}개 매체
                      </span>
                      {e.changePct != null && (
                        <span
                          className={`tnum text-[11px] font-medium ${
                            e.changePct >= 0 ? "text-up-on-navy" : "text-down-on-navy"
                          }`}
                        >
                          {fmtPct(e.changePct)}
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Link
        href="/reports"
        className="mt-3 inline-block text-[11px] text-on-navy-3 transition-colors hover:text-on-navy-2"
      >
        추천에 오르지 못한 종목까지 전체 분석 보기 →
      </Link>
    </section>
  );
}
