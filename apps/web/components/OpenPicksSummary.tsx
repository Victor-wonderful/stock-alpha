import Link from "next/link";

import type { OpenPick } from "@/lib/data";
import { fmtPct } from "@/lib/format";

/**
 * 밴드 2 좌측 — 「진행 중」 요약 패널.
 *
 * 밴드 1 이 [오늘 요약(네이비) | 오늘의 픽 카드] 인 것과 같은 짝을 만든다
 * (2026-08-22 Victor — "좌측에는 진행중인 종목에 대한 정보, 우측에는 수익률이 포함된
 * 진입가격 등"). 좌는 «전체가 어떤가», 우는 «종목별로 어떤가»다.
 *
 * ⚠️ 네이비를 쓰지 않는다. 밴드 1 의 네이비 패널과 나란히 두면 화면에 네이비 덩어리가
 * 둘이 되어 어느 쪽이 «오늘»인지 흐려진다. 여기는 흰 패널 + 좌측 레일로 격을 낮춘다 —
 * 오늘의 판정이 주인공이고 이건 그 다음이다.
 */
export function OpenPicksSummary({ picks }: { picks: OpenPick[] }) {
  const withRet = picks.filter((p) => p.returnPct != null);
  const avgRet =
    withRet.length > 0
      ? withRet.reduce((s, p) => s + (p.returnPct ?? 0), 0) / withRet.length
      : null;
  const winners = withRet.filter((p) => (p.returnPct ?? 0) > 0).length;
  const nearStop = picks.filter(
    (p) => p.toStopPct != null && p.toStopPct >= -0.03,
  ).length;
  const breakeven = picks.filter((p) => p.tp1Hit).length;

  return (
    <section className="rounded-[14px] border border-border bg-surface px-5 py-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[20px] font-bold leading-[1.3] tracking-[-0.4px] text-text">
          {picks.length > 0 ? `진행중 ${picks.length}건` : "진행중인 픽 없음"}
        </h2>
        {avgRet != null && (
          <span
            className={`tnum text-[15px] font-bold ${avgRet >= 0 ? "text-good" : "text-bad"}`}
          >
            현재 손익률 평균 {fmtPct(avgRet)}
          </span>
        )}
      </div>

      {/* ⚠️ 대기 건수·진입 예정일은 여기서 말하지 않는다 — 우측 카드 자리가 그걸
          말한다. 좌우가 같은 문장을 두 번 하면 밴드 전체가 헛돈다(2026-08-22). 
          좌는 «진행중 전체가 어떤가», 우는 «종목별로 어떤가»다. */}
      <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
        {picks.length > 0
          ? "진입가 대비 현재 종가 기준입니다. 아직 팔지 않았으므로 확정 손익이 아닙니다."
          : "픽이 체결되면 진행중 전체의 손익과 위험을 여기서 봅니다."}
      </p>

      {picks.length > 0 && (
        <dl className="mt-4 divide-y divide-border-soft border-y border-border-soft">
          <div className="flex items-baseline gap-3 py-2.5">
            <dt className="w-[68px] shrink-0 text-[12px] text-text-mute">이익 중</dt>
            <dd className="tnum flex-1 text-[13px] text-text">
              <span className="font-bold">{winners}건</span>
              <span className="text-text-mute"> / {withRet.length}건</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-3 py-2.5">
            <dt className="w-[68px] shrink-0 text-[12px] text-text-mute">손절 근접</dt>
            <dd className="tnum flex-1 text-[13px]">
              <span className={nearStop > 0 ? "font-bold text-bad" : "text-text-dim"}>
                {nearStop}건
              </span>
              {nearStop > 0 && (
                <span className="text-[11px] text-text-mute"> · 3% 이내</span>
              )}
            </dd>
          </div>
          <div className="flex items-baseline gap-3 py-2.5">
            <dt className="w-[68px] shrink-0 text-[12px] text-text-mute">본전스톱</dt>
            <dd className="tnum flex-1 text-[13px]">
              <span className={breakeven > 0 ? "font-bold text-pass" : "text-text-dim"}>
                {breakeven}건
              </span>
              {breakeven > 0 && (
                <span className="text-[11px] text-text-mute"> · 손해 구간 없음</span>
              )}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/picks"
          className="rounded-[9px] border border-border-strong px-4 py-2 text-[13px] font-semibold text-text transition-colors hover:bg-surface-2"
        >
          전체 기록
        </Link>
      </div>
    </section>
  );
}
