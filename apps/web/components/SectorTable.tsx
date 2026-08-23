"use client";

import { useState } from "react";

import { fmtNum } from "@/lib/format";
import type { SectorRotationView } from "@/lib/types";

/**
 * 섹터 표 — 상위 5 · 하위 5 를 펼치고 가운데는 접는다.
 *
 * 27개를 전부 세로로 세우면 이 카드 하나가 화면 274줄을 먹는다. 로테이션을 보는
 * 사람이 궁금한 건 «어디가 앞서고 어디가 처지나»이지 중간이 아니다.
 *
 * ⚠️ 접기만 하고 펼칠 수단이 없었다(2026-08-23 Victor: "중간에 접었다고 하는데
 * 펼쳐지지 않고"). 접은 것은 반드시 펼 수 있어야 한다 — 접힌 줄 자체를 버튼으로
 * 만든다. 그래서 이 표만 클라이언트 컴포넌트다.
 */
export function SectorTable({
  sectors,
  signalCountBySector,
  edge = 5,
}: {
  /** 모멘텀 내림차순으로 이미 정렬돼 온다. */
  sectors: SectorRotationView[];
  signalCountBySector: Record<string, number>;
  edge?: number;
}) {
  const [open, setOpen] = useState(false);
  const foldable = sectors.length > edge * 2 + 1;
  const hidden = foldable ? sectors.length - edge * 2 : 0;
  const maxMom = Math.max(...sectors.map((s) => Math.abs(s.momentum)), 1);

  const shown =
    !foldable || open
      ? sectors.map((s, i) => ({ s, i }))
      : [
          ...sectors.slice(0, edge).map((s, i) => ({ s, i })),
          ...sectors
            .slice(sectors.length - edge)
            .map((s, k) => ({ s, i: sectors.length - edge + k })),
        ];
  // 접힌 줄을 어디에 끼울지 — 접혀 있을 때만, 앞쪽 edge 개 뒤에.
  const foldAt = !foldable || open ? -1 : edge - 1;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="border-b border-border">
            {/* 「상대강도」 열을 뺐다 — 모멘텀z 의 절대값을 최댓값으로 나눈 파생값이라
                바로 왼쪽 열과 같은 것을 두 번 그리고 있었다. 순위도 뺐다 — 표가 이미
                모멘텀 순이다. */}
            {["섹터", "모멘텀 (20일 추세)", "수급 5일", "오늘 시그널"].map((h) => (
              <th
                key={h}
                className="pb-1.5 pr-3 text-left text-[10px] font-medium text-text-mute"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map(({ s, i }, k) => {
            const sigCount = signalCountBySector[s.sector] ?? 0;
            // 막대 폭은 모멘텀의 «최대 대비 비율». 숫자 옆에 두면 크기가 눈으로 잡힌다.
            const bar = Math.round((Math.abs(s.momentum) / maxMom) * 100);
            return (
              <tr
                key={s.sector}
                className={`border-b border-border/50 last:border-0 ${
                  k === foldAt ? "" : ""
                }`}
                data-rank={i + 1}
              >
                <td className="py-2 pr-3 font-medium text-text">{s.sector}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`tnum w-11 shrink-0 text-right font-semibold ${
                        s.momentum >= 0 ? "text-good" : "text-bad"
                      }`}
                    >
                      {s.momentum > 0 ? "+" : ""}
                      {fmtNum(s.momentum, 2)}
                    </span>
                    <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className={`h-1.5 rounded-full ${s.momentum >= 0 ? "bg-good" : "bg-bad"}`}
                        style={{ width: `${bar}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className={`tnum py-2 pr-3 ${s.flow >= 0 ? "text-good" : "text-bad"}`}>
                  {s.flow >= 0 ? "+" : ""}
                  {s.flow.toLocaleString()}억
                </td>
                <td className="tnum py-2 pr-3 text-text-dim">
                  {sigCount > 0 ? `${sigCount}건` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {foldable && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 w-full rounded-[8px] border border-border-soft bg-surface-2 py-2 text-[11px] font-semibold text-text-dim transition-colors hover:border-border-strong hover:text-text"
        >
          {open
            ? `중간 ${hidden}개 접기 — 상위·하위 ${edge}개만 보기`
            : `중간 ${hidden}개 섹터 펼치기 (지금은 상위·하위 ${edge}개만)`}
        </button>
      )}
    </div>
  );
}
