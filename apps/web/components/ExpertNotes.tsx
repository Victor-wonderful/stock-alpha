import Link from "next/link";

import type { ExpertNote, LatestPrice } from "@/lib/data";
import { SectionHead } from "@/components/SectionHead";
import { fmtPrice } from "@/lib/format";

/**
 * 「전문가 추천」 — 사람이 고른 종목.
 *
 * ⚠️ 「오늘의 픽」과 **모양을 일부러 다르게 그린다**. 저건 표(진입가·손절가·기간이
 * 열로 선다)이고 이건 카드다. 같은 모양으로 그리면 사용자가 «이것도 검증된 것»으로
 * 읽는다 — 여기엔 손절가가 없다. 손절 없이 산 뒤 당황하는 게 가장 나쁜 결과다.
 *
 * 그래서 카드마다 «검증 없음»을 적는다. 감추면 이 서비스의 다른 숫자들까지 의심받는다.
 *
 * 2026-08-23 Victor 결정 — 추적하지 않는다. 상태·수익률 컬럼이 없는 것이 설계다.
 *
 * 2026-08-24 Victor 지적으로 **가격 레벨은 들어왔다** — "얼마에 진입하고 목표가는
 * 얼마, 손절가는 얼마 이런 부분도 있어야 하는 거 아닌가?" 맞다. 레벨 없는 추천은
 * 읽는 사람이 실행할 수 없고, 손절 없이 사게 만든다.
 *
 * 그래도 «추적»은 여전히 안 한다. 아래 현재가 줄은 성적이 아니라 **지금 값**이다 —
 * 승패를 집계하지 않고, 엔진 픽 성과에도 섞지 않는다. 그래서 카드에는 «수익률»이라는
 * 말을 쓰지 않고 «진입가 대비»라고만 적는다.
 */
export function ExpertNotes({
  notes,
  prices,
  failed = false,
  moreHref = "/insights",
}: {
  notes: ExpertNote[];
  /** 종목별 마지막 종가 — «지금 값»을 적으려면 그 값을 실제로 보여줘야 한다. */
  prices?: Map<string, LatestPrice>;
  /** 조회 자체가 실패했나 — «아직 글이 없다»와 다른 말이다(2026-08-24).
   *  이 코너는 0040 마이그레이션이 운영 DB 에 적용되기 전까지 표가 없었는데,
   *  화면은 그동안 "아직 올라온 추천이 없습니다"라고 했다. 준비 중인 것과
   *  못 읽는 것을 같은 문장으로 말하면, 진짜 고장 났을 때 아무도 모른다. */
  failed?: boolean;
  moreHref?: string | null;
}) {
  return (
    <section>
      <SectionHead
        title="전문가 추천"
        sub="사람이 고른 종목입니다. 진입가·손절가는 글쓴이가 직접 적은 것이고, 엔진의 「오늘의 픽」과 달리 백테스트 게이트를 거치지 않으며 성과를 추적하지 않습니다."
        href={moreHref ?? undefined}
        linkLabel="전체 보기"
      />

      {notes.length === 0 ? (
        <div className="mt-6 rounded-[12px] border border-dashed border-border-strong bg-surface px-5 py-8 text-center">
          {failed ? (
            <>
              <p className="text-[13px] font-semibold text-text">추천을 불러오지 못했습니다</p>
              <p className="mt-1 text-[12px] text-text-mute">
                글이 없는 것이 아니라 지금 읽어 오지 못한 것입니다. 잠시 뒤 다시 열어 주세요.
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-text">아직 올라온 추천이 없습니다</p>
              <p className="mt-1 text-[12px] text-text-mute">
                참여 전문가의 추천이 등록되면 여기에 쌓입니다.
              </p>
              {/* 비어 있는 코너에 «들어오는 길»을 둔다. 글이 0편일 때 이 자리를 보는
                  사람은 대개 «여긴 뭐 하는 코너지»가 궁금한 사람이고, 그중 일부가
                  쓰는 쪽이 될 사람이다(2026-08-24). */}
              <Link
                href="/expert/apply"
                className="mt-4 inline-flex min-h-9 items-center rounded-[9px] border border-border px-4 text-[12.5px] font-semibold text-text-dim transition-colors hover:text-accent"
              >
                전문가로 참여하기
              </Link>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="flex flex-col rounded-[12px] border border-border bg-surface p-4"
            >
              {/* 사람이 먼저다 — 누가 말했는지가 이 카드의 근거 전부다.
                  엔진 픽은 반대로 종목이 먼저다(누가 골랐는지는 규칙이므로). */}
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-3 text-[12px] font-bold text-text-dim"
                >
                  {n.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    n.expertName.slice(0, 1)
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-text">
                    {n.expertName}
                  </span>
                  {n.expertHeadline && (
                    <span className="block truncate text-[11px] text-text-mute">
                      {n.expertHeadline}
                    </span>
                  )}
                </span>
                <span className="tnum ml-auto shrink-0 text-[11px] text-text-mute">
                  {n.asOf.slice(5).replace("-", "/")}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {n.symbol ? (
                  <Link
                    href={`/stocks/${n.symbol}`}
                    className="text-[15px] font-bold text-text hover:text-accent"
                  >
                    {n.name ?? n.symbol}
                  </Link>
                ) : (
                  <span className="text-[15px] font-bold text-text">{n.name ?? "—"}</span>
                )}
                {n.symbol && (
                  <span className="tnum text-[11px] text-text-mute">{n.symbol}</span>
                )}
                <span
                  className={`rounded-[999px] px-2 py-0.5 text-[11px] font-semibold ${
                    n.stance === "buy"
                      ? "bg-accent-soft text-accent"
                      : "bg-surface-3 text-text-dim"
                  }`}
                >
                  {n.stance === "buy" ? "매수 의견" : "관심"}
                </span>
              </div>

              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-text-dim">
                {n.summary}
              </p>

              {/* 레벨 — «얼마에 사서 어디서 접나». 목표가는 없을 수 있다(선택 항목). */}
              {n.entryPrice != null && (
                <dl className="mt-3 grid grid-cols-3 gap-2 rounded-[9px] bg-surface-2 px-3 py-2.5">
                  {[
                    { k: "진입", v: n.entryPrice, cls: "text-text" },
                    { k: "손절", v: n.stopLoss, cls: "text-bad" },
                    { k: "목표", v: n.targetPrice, cls: "text-good" },
                  ].map((f) => (
                    <div key={f.k}>
                      <dt className="text-[10.5px] text-text-mute">{f.k}</dt>
                      <dd className={`tnum text-[13px] font-semibold ${f.v == null ? "text-text-mute" : f.cls}`}>
                        {f.v == null ? "—" : fmtPrice(f.v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {(() => {
                // 「진입가 대비」라고 적으려면 기준이 되는 현재가를 함께 보여야 한다
                // (2026-08-23 원칙). 값이 없으면 줄 자체를 그리지 않는다.
                const p = n.symbol ? prices?.get(n.symbol) : undefined;
                if (!p || n.entryPrice == null) return null;
                const diff = (p.close - n.entryPrice) / n.entryPrice;
                const stopped = n.stopLoss != null && p.close <= n.stopLoss;
                return (
                  <p className="tnum mt-2 text-[11.5px] text-text-mute">
                    현재가 {fmtPrice(p.close)}
                    <span className="mx-1.5 opacity-40">·</span>
                    진입가 대비{" "}
                    <span className={diff >= 0 ? "text-good" : "text-bad"}>
                      {diff >= 0 ? "+" : ""}
                      {(diff * 100).toFixed(1)}%
                    </span>
                    {stopped && <span className="ml-1.5 text-bad">손절가 아래</span>}
                  </p>
                );
              })()}

              {n.horizonNote && (
                <p className="mt-1.5 text-[11.5px] text-text-mute">
                  글쓴이가 보는 기간 · {n.horizonNote}
                </p>
              )}

              {n.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {n.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded-[4px] bg-surface-2 px-1.5 py-px text-[10.5px] text-text-mute"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* 경계선 — 이 카드가 엔진 픽이 아님을 카드 안에서 못 박는다. */}
              <p className="mt-3 border-t border-border-soft pt-2.5 text-[10.5px] leading-relaxed text-text-mute">
                참여 전문가 개인의 의견입니다 · 시스템 검증(백테스트 게이트)을 거치지
                않았고, 이 코너는 성과를 추적하지 않습니다
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
