import Link from "next/link";

import type { OpenPick } from "@/lib/data";
import { fmtPct } from "@/lib/format";

/**
 * 홈 「진행 중」 — 이미 산 픽이 지금 어떻게 되고 있나.
 *
 * 홈은 getOpenPicks(30) 으로 보유 픽을 통째로 받아놓고 `.length` 만 쓰고 버리고
 * 있었다(2026-08-22 Victor 지적 — "대기 종목이 어떻게 변동하는지 보여주는 섹션이
 * 있어야 하는 거 아닌가"). 아침 브리핑 때와 같은 패턴이다. 조회는 늘지 않는다.
 *
 * ⚠️ 「대기」와 「진행 중」은 다르다.
 *   대기(pending)  = 오늘 발행 → 다음 거래일 시가에 살 것. 그게 「오늘의 픽」 카드다.
 *   진행 중(open)  = 이미 산 것. 매일 값이 바뀌는 건 이쪽이다.
 *
 * 정렬은 getOpenPicks 가 «손절에 가까운 순»으로 준다 — 오늘 봐야 할 게 위로 온다.
 */

/** 손절까지 남은 거리로 위험 색을 정한다. toStopPct 는 롱에서 음수이고 0 에 가까울수록 코앞. */
function stopTone(toStopPct: number | null): string {
  if (toStopPct == null) return "text-text-mute";
  if (toStopPct >= -0.03) return "text-bad font-semibold"; // 3% 이내 — 코앞
  if (toStopPct >= -0.07) return "text-warn";
  return "text-text-mute";
}

export function HomeOpenPicks({
  picks,
  pendingCount = 0,
  planDay,
}: {
  picks: OpenPick[];
  /** 오늘 발행분 중 아직 안 산 건수 — 빈 상태 문구에 쓴다. */
  pendingCount?: number;
  /** 그 대기 픽을 살 날 — "8월 24일(월)". 모르면 null. */
  planDay?: string | null;
}) {
  const won = (v: number) => Math.round(v).toLocaleString("ko-KR");

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-text">
          진행 중{" "}
          <span className="text-[11px] font-medium text-text-mute">
            {picks.length > 0
              ? `이미 산 픽 ${picks.length}건 · 손절 가까운 순`
              : "이미 산 픽"}
          </span>
        </h2>
        <Link href="/picks" className="text-[11px] text-accent hover:underline">
          전체 기록 →
        </Link>
      </div>

      {/* 0 건이어도 섹션은 남는다(2026-08-22 Victor — "진행 중 종목이 없을 수 없잖아,
          섹션을 만들어놔라"). 자리를 지워버리면 보유가 생기는 날 화면 구조가 통째로
          바뀌어, 매일 오는 사람이 «어제 보던 그 자리»를 잃는다.
          네이비 패널에서 걷어낸 「대기」 정보를 이 빈 상태가 흡수한다 — «아직 없다»와
          «곧 생긴다»는 한자리에서 말해야 이어진다. */}
      {picks.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border bg-surface/50 px-5 py-7 text-center">
          <p className="text-[13px] text-text-dim">아직 산 픽이 없습니다.</p>
          <p className="mt-1 text-[12px] text-text-mute">
            {pendingCount > 0 ? (
              <>
                <span className="tnum font-semibold text-text-dim">{pendingCount}건</span>이{" "}
                {planDay ?? "다음 거래일"} 시가에 들어옵니다.
              </>
            ) : (
              "픽이 체결되면 진입가 대비 손익과 손절까지 남은 거리가 여기 쌓입니다."
            )}
          </p>
        </div>
      ) : (
      <>

      <div className="overflow-x-auto rounded-[12px] border border-border bg-surface">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-text-mute">
              <th className="py-2 pl-4 pr-3 text-left font-medium">종목</th>
              <th className="px-3 py-2 text-right font-medium">진입가</th>
              <th className="px-3 py-2 text-right font-medium">현재가</th>
              <th className="px-3 py-2 text-right font-medium">손익</th>
              <th className="px-3 py-2 text-right font-medium">손절까지</th>
              <th className="px-3 py-2 text-right font-medium">본전까지</th>
              <th className="py-2 pl-3 pr-4 text-right font-medium">보유</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((p) => (
              <tr key={p.symbol} className="border-b border-border-soft last:border-0">
                <td className="py-2.5 pl-4 pr-3">
                  <Link
                    href={`/stocks/${p.symbol}`}
                    className="font-semibold text-text hover:text-accent"
                  >
                    {p.name}
                  </Link>
                  {/* 본전스톱으로 전환된 픽 — 이 시점부터 손절선이 진입가다. */}
                  {p.tp1Hit && (
                    <span className="ml-1.5 rounded-[4px] bg-pass-soft px-1.5 py-px text-[10px] font-semibold text-pass">
                      본전스톱
                    </span>
                  )}
                </td>
                <td className="tnum px-3 py-2.5 text-right text-text-dim">
                  {p.entry != null ? won(p.entry) : "—"}
                </td>
                <td className="tnum px-3 py-2.5 text-right text-text">
                  {p.last != null ? won(p.last) : "—"}
                </td>
                <td
                  className={`tnum px-3 py-2.5 text-right font-semibold ${
                    p.returnPct == null
                      ? "text-text-mute"
                      : p.returnPct >= 0
                        ? "text-good"
                        : "text-bad"
                  }`}
                >
                  {p.returnPct != null ? fmtPct(p.returnPct) : "—"}
                </td>
                <td className={`tnum px-3 py-2.5 text-right ${stopTone(p.toStopPct)}`}>
                  {p.toStopPct != null ? fmtPct(p.toStopPct) : "—"}
                </td>
                {/* 본전 «도달가»까지 남은 거리. 이미 전환된 픽은 지나온 값이라 비운다. */}
                <td className="tnum px-3 py-2.5 text-right text-text-mute">
                  {p.tp1Hit ? "도달" : p.toTargetPct != null ? fmtPct(p.toTargetPct) : "—"}
                </td>
                <td className="tnum py-2.5 pl-3 pr-4 text-right text-text-mute">
                  {p.heldDays}일
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-text-mute">
        손절까지가 0에 가까울수록 코앞입니다 · 본전 도달가에 닿으면 손절이 진입가로
        올라가 그 뒤로는 손해 구간이 사라집니다
      </p>
      </>
      )}
    </section>
  );
}
