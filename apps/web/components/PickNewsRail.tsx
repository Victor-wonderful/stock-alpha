import Link from "next/link";

import type { DisclosureView, NewsEvent } from "@/lib/data";
import type { EventEvidence } from "@/lib/events";
import { fmtPct } from "@/lib/format";
import { VERDICT_LABEL, VERDICT_CLASS, evidenceSentence, contradictsDirection } from "@/lib/events";

/**
 * 「오늘의 픽」 우측 레일 — 추천·보유 종목에 무슨 일이 있었나.
 *
 * 이 자리에는 원래 「픽 기록」(종료 35건 · 승률 11% · 평균 손익 -6.2% + 최근 목록)이
 * 있었다. 두 가지 이유로 걷어낸다(2026-08-23 Victor).
 *
 *  1) 숫자가 틀렸다. 「종료」에 «미체결»(진입가에 안 닿아 사지 못한 것 = 거래 없음)과
 *     «규칙 교체 정리»(기간이 다 돼서가 아니라 우리가 규칙을 바꿔 닫은 것)가 섞여
 *     있었다. 목록 맨 위에는 아직 사지도 않은 「오리온 · 진입 대기」가 «기록»으로
 *     올라와 있었다. 성과 집계는 /picks 한 곳에서 정리한다.
 *  2) 자리가 겹쳤다. 「진행 중」 섹션이 생기면서 보유 픽 상태는 그쪽이 말한다.
 *
 * 대신 «추천 종목과 관련된 뉴스·공시»를 놓는다. 픽을 보는 사람이 바로 옆에서 확인하고
 * 싶은 것은 지난 성적표가 아니라 «이 종목에 무슨 일이 있었나»다.
 *
 * ⚠️ 규약 두 가지를 지킨다.
 *  - 뉴스는 제목·본문을 쓰지 않고 외부 링크도 없다(언론사 저작물). «같은 날 몇 개
 *    매체가 다뤘나»와 그날 등락만 적는다 — components/RecentCoverage 와 같은 규약.
 *  - 뉴스는 매수 신호가 아니다(실적 발표 후 주가 흐름 실측 -0.02). 그래서 이 패널은
 *    판단을 하지 않고 «있었던 일»만 적는다. 공시 유형별 실측 판정(event_evidence)이
 *    있는 것만 그 유형의 과거 성적을 덧붙인다 — 분류와 실측이 어긋나면 그것도 적는다.
 */
export function PickNewsRail({
  rows,
  news,
  disclosures,
  evidence,
  days,
}: {
  /** 소식을 볼 종목 — 오늘의 픽이 먼저, 그다음 보유 픽. */
  rows: { symbol: string; name: string; kind: "pick" | "open" }[];
  news: Map<string, NewsEvent[]>;
  disclosures: Map<string, DisclosureView[]>;
  evidence: Map<string, EventEvidence>;
  days: number;
}) {
  return (
    <section className="rounded-[12px] border border-border bg-surface px-5 py-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-text">종목 소식</h2>
        <Link href="/market" className="text-[11px] text-accent hover:underline">
          시장 전체 →
        </Link>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-text-mute">
        추천·보유 종목의 최근 {days}일 공시와 보도입니다.
      </p>

      {rows.length === 0 ? (
        <p className="text-[12px] text-text-mute">
          추천·보유 종목이 없어 볼 소식도 없습니다.
        </p>
      ) : (
        <div className="divide-y divide-border-soft">
          {rows.map((r) => {
            const ds = disclosures.get(r.symbol) ?? [];
            const evs = news.get(r.symbol) ?? [];
            return (
              <div key={`${r.kind}-${r.symbol}`} className="py-2.5 first:pt-0">
                <div className="flex items-baseline gap-1.5">
                  <Link
                    href={`/stocks/${r.symbol}`}
                    className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-text hover:text-accent"
                  >
                    {r.name}
                  </Link>
                  <span className="shrink-0 rounded-[4px] bg-surface-2 px-1.5 py-px text-[10px] text-text-mute">
                    {r.kind === "pick" ? "오늘의 픽" : "보유"}
                  </span>
                </div>

                {/* 공시 — 제목을 그대로 쓴다(DART 는 공공기록). */}
                {ds.map((d) => {
                  const ev = d.eventType ? evidence.get(d.eventType) : undefined;
                  const flips = contradictsDirection(d.direction, ev?.verdict);
                  return (
                    <div key={d.id} className="mt-1.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="tnum shrink-0 text-[10px] text-text-mute">
                          {d.receiptDate.slice(5).replace("-", "/")}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-text-dim">
                          {d.reportName}
                        </span>
                        {ev && (
                          <span
                            className={`shrink-0 rounded-[4px] px-1.5 py-px text-[10px] font-semibold ${VERDICT_CLASS[ev.verdict]}`}
                            title={evidenceSentence(ev) ?? undefined}
                          >
                            {VERDICT_LABEL[ev.verdict]}
                          </span>
                        )}
                      </div>
                      {/* 「분류와 실측이 다름」이 이 패널에서 가장 값이 큰 한 줄이다 —
                          이름만 보고 붙인 호재/악재와, 실제로 세어본 결과가 어긋난 경우다. */}
                      {ev && ev.verdict !== "insufficient" && (
                        <p className="mt-0.5 text-[10px] leading-relaxed text-text-mute">
                          {flips && <span className="font-semibold text-warn">분류와 실측이 다름 · </span>}
                          {evidenceSentence(ev)}
                        </p>
                      )}
                    </div>
                  );
                })}

                {/* 보도 — 제목 없이 «같은 날 몇 개 매체가 다뤘나»와 그날 등락만. */}
                {evs.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[10.5px] text-text-mute">
                    <span className="font-semibold text-text-dim">보도</span>
                    {evs.slice(0, 2).map((e) => (
                      <span key={e.date} className="tnum">
                        {e.date.slice(5).replace("-", "/")} {e.outletCount}개
                        {e.changePct != null && (
                          <span className={e.changePct >= 0 ? " text-good" : " text-bad"}>
                            {" "}
                            {fmtPct(e.changePct)}
                          </span>
                        )}
                      </span>
                    ))}
                  </p>
                )}

                {/* 조용한 종목은 조용하다고 적는다 — 그것도 정보다. */}
                {ds.length === 0 && evs.length === 0 && (
                  <p className="mt-1 text-[10.5px] text-text-mute">
                    최근 {days}일 공시·보도 없음
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 border-t border-border-soft pt-2.5 text-[10px] leading-relaxed text-text-mute">
        기사 제목·본문은 싣지 않고 외부 링크도 없습니다 — 같은 날 2개 이상 매체가 다룬
        사실과 그날 등락만 셉니다. <span className="text-text-dim">뉴스는 매수 신호가
        아닙니다</span>(실적 발표 뒤 주가 흐름을 재봤을 때 상관이 거의 없었습니다).
      </p>
    </section>
  );
}
