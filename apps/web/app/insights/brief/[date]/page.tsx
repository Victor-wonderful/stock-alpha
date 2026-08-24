import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { MarketBrief } from "@/components/MarketBrief";
import { regimeName } from "@/components/RegimeHeader";
import { getMorningBriefByDate, getMorningBriefs, getNextTradingDay } from "@/lib/data";
import { tradingDayLabel } from "@/lib/format";

/**
 * 하루치 모닝 브리프 — 지난 브리프를 그대로 읽는 화면.
 *
 * 여기가 `payload.narrative` 가 처음으로 화면에 나오는 자리다. 엔진은 매 거래일
 * 시황 문단(market_view)과 관전 포인트(watchpoints)를 써 왔는데, 지금까지 로더가
 * 읽기만 하고 어떤 화면도 그리지 않았다(2026-08-24 확인). 홈은 헤드라인 한 줄,
 * 시장 페이지는 시장 폭만 썼다.
 *
 * 시제에 주의한다 — 이 화면은 «지금»이 아니라 «그날»이다. 그래서 국면은 이름만
 * 칩으로 얹고(RegimeHeader 의 "지금 시장:" 문장은 쓰지 않는다), 매크로는 지표마다
 * 기준일을 적는다.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return {
    title: `모닝 브리프 ${date} — VECTA Stock`,
    description: "그날 장이 어떻게 끝났는지의 기록입니다. 전망이 아니라 측정한 것만 적습니다.",
  };
}

export default async function BriefDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  const [brief, all] = await Promise.all([
    getMorningBriefByDate(date),
    // 앞뒤 이동에 쓴다. 목록을 한 번 읽는 편이 이웃 날짜를 따로 조회하는 것보다 낫다 —
    // 휴장일이 있어 «하루 빼기»로는 이웃 브리프를 찾을 수 없다.
    getMorningBriefs(400),
  ]);
  if (!brief) notFound();

  const idx = all.findIndex((b) => b.as_of === date);
  const newer = idx > 0 ? all[idx - 1] : null; // 목록은 최신순 — 앞쪽이 더 최근이다
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  const planDay = await getNextTradingDay(brief.as_of);
  const rg = regimeName(brief.regime?.market_state ?? null);
  // 배치가 안 돈 날의 기록. «내용이 비었나»로 판정하면 안 된다 — 2026-08-13 이전
  // 브리프는 시장 폭 집계가 붙기 전이라 market 이 없을 뿐 멀쩡한 글이다.
  const outage = brief.kind === "outage";

  return (
    <AppShell
      title="모닝 브리프"
      asOf={`${tradingDayLabel(brief.as_of)} 기준`}
      subtitle="그날 장이 끝난 뒤의 기록입니다. 앞을 내다본 글이 아니라, 끝난 장의 숫자와 과거 같은 날들이 어떻게 됐는지입니다."
      badge={
        rg && !outage ? (
          <span className="rounded-[999px] bg-on-navy/10 px-2.5 py-1 text-[10px] font-semibold text-on-navy-2">
            그날 국면 · {rg.name}
          </span>
        ) : null
      }
    >
      <Link
        href="/insights"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-text-mute transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} strokeWidth={2} aria-hidden />
        인사이트
      </Link>

      <article className="mt-4 max-w-[74ch]">
        <h2 className="text-[22px] font-bold leading-[1.45] tracking-[-0.4px] text-text">
          {outage ? "이 날은 분석이 발행되지 않았습니다" : brief.headline || `${brief.as_of} 브리프`}
        </h2>

        {outage ? (
          // 「없음」을 채우지 않는다 — 그날은 배치가 안 돌았고, 그 사실이 이 화면의 내용이다.
          // 사유는 DB 에 적힌 그날의 기록을 그대로 옮긴다(우리가 다시 쓰지 않는다).
          <div className="mt-5 rounded-[12px] border border-warn/30 bg-warn-soft p-5">
            <p className="text-[13.5px] leading-[1.75] text-text">{brief.headline}</p>
            <p className="mt-3 border-t border-warn/20 pt-3 text-[12.5px] leading-[1.7] text-text-dim">
              빈 자리를 사후에 메우지 않고 공백으로 남깁니다 — 나중에 소급해 만든 숫자는
              그날 실제로 볼 수 있었던 것이 아닙니다.
            </p>
          </div>
        ) : (
          <>
            {brief.market_view && (
              <p className="mt-5 whitespace-pre-line text-[15px] leading-[1.8] text-text-dim">
                {brief.market_view}
              </p>
            )}

            {brief.watchpoints.length > 0 && (
              <section className="mt-8 rounded-[12px] border border-border bg-surface p-5">
                <h3 className="text-[13px] font-bold text-text">그날 적어둔 관전 포인트</h3>
                <p className="mt-1 text-[11.5px] text-text-mute">
                  다음 거래일{planDay ? ` ${tradingDayLabel(planDay)}` : ""} 플랜의 전제로 적은
                  것입니다. 지금 시점의 지시가 아닙니다.
                </p>
                <ul className="mt-3 space-y-2">
                  {brief.watchpoints.map((w) => (
                    <li
                      key={w}
                      className="flex gap-2.5 text-[13.5px] leading-[1.7] text-text-dim"
                    >
                      <span
                        className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-accent"
                        aria-hidden
                      />
                      <span className="min-w-0">{w}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {brief.market && (
              <div className="mt-10 border-t border-border-soft pt-8">
                <MarketBrief market={brief.market} planDay={planDay} />
              </div>
            )}

            {brief.regime && (brief.regime.drivers?.length ?? 0) > 0 && (
              <section className="mt-10 border-t border-border-soft pt-8">
                <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-text">
                  그날 국면{rg ? ` — ${rg.name}` : ""}
                </h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {brief.regime.drivers.map((d) => (
                    <li
                      key={d}
                      className="rounded-[999px] border border-border bg-surface px-3 py-1 text-[12px] text-text-dim"
                    >
                      {d}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {brief.macro.length > 0 && (
              <section className="mt-10 border-t border-border-soft pt-8">
                <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-text">
                  그날의 해외 지표
                </h3>
                <p className="mt-1 text-[12px] text-text-mute">
                  지표마다 발표 주기가 달라 날짜가 갈립니다. 그래서 값마다 기준일을 적습니다.
                </p>
                <ul className="mt-4 overflow-hidden rounded-[12px] border border-border bg-surface">
                  {brief.macro.map((m, i) => {
                    const up = (m.change_pct ?? 0) >= 0;
                    return (
                      <li
                        key={m.series}
                        className={`flex items-baseline gap-3 px-4 py-3 ${
                          i > 0 ? "border-t border-border-soft" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] text-text-dim">
                          {m.label}
                          {m.date && (
                            <span className="tnum ml-1.5 text-[10.5px] text-text-mute">
                              {m.date.slice(5).replace("-", "/")}
                            </span>
                          )}
                        </span>
                        <span className="tnum shrink-0 text-[14px] font-bold text-text">
                          {m.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                        </span>
                        <span
                          className={`tnum w-[64px] shrink-0 text-right text-[11.5px] font-semibold ${
                            m.change_pct == null ? "text-text-mute" : up ? "text-good" : "text-bad"
                          }`}
                        >
                          {m.change_pct == null
                            ? "—"
                            : `${up ? "+" : ""}${(m.change_pct * 100).toFixed(2)}%`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </article>

      {/* 앞뒤 이동 — 아카이브는 «한 편»이 아니라 «연속된 날»로 읽힌다.
          목록이 최신순이므로 왼쪽이 과거, 오른쪽이 최신이다. */}
      <nav className="mt-12 flex flex-wrap items-stretch gap-3 border-t border-border-soft pt-6">
        {older ? (
          <Link
            href={`/insights/brief/${older.as_of}`}
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
          >
            <ArrowLeft size={15} strokeWidth={2} className="shrink-0 text-text-mute" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[11px] text-text-mute">이전 거래일</span>
              <span className="block truncate text-[13px] font-semibold text-text group-hover:text-accent">
                {tradingDayLabel(older.as_of)}
              </span>
            </span>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {newer ? (
          <Link
            href={`/insights/brief/${newer.as_of}`}
            className="group flex min-w-0 flex-1 items-center justify-end gap-3 rounded-[12px] border border-border bg-surface px-4 py-3 text-right transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0">
              <span className="block text-[11px] text-text-mute">다음 거래일</span>
              <span className="block truncate text-[13px] font-semibold text-text group-hover:text-accent">
                {tradingDayLabel(newer.as_of)}
              </span>
            </span>
            <ArrowRight size={15} strokeWidth={2} className="shrink-0 text-text-mute" aria-hidden />
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </nav>
    </AppShell>
  );
}
