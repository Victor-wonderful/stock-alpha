import Link from "next/link";

import type { ExpertNote } from "@/lib/data";
import { SectionHead } from "@/components/SectionHead";

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
 */
export function ExpertNotes({
  notes,
  failed = false,
  moreHref = "/insights",
}: {
  notes: ExpertNote[];
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
        sub="사람이 고른 종목입니다. 엔진의 「오늘의 픽」과 달리 손절가가 없고, 성과를 추적하지 않습니다."
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
                참여 전문가 개인의 의견입니다 · 시스템 검증을 거치지 않았고 진입가·손절가·
                보유기간이 없습니다
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
