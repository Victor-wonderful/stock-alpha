import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";

import { TRADE_SETUP_LABELS } from "@stock-alpha/db";
import type { OpenPick } from "@/lib/data";
import { fmtPct } from "@/lib/format";
import { horizonSpec } from "@/lib/holding";

/**
 * 「진행 중」 표 — 이미 산 픽이 지금 어떻게 되고 있나. 홈과 /focus 가 같이 쓴다.
 *
 * 홈은 getOpenPicks(30) 으로 보유 픽을 통째로 받아놓고 `.length` 만 쓰고 버리고
 * 있었다(2026-08-22 Victor). 아침 브리핑 때와 같은 패턴이다. 조회는 늘지 않는다.
 *
 * ⚠️ 「대기」와 「진행 중」은 다르다.
 *   대기(pending)  = 오늘 발행 → 다음 거래일 시가에 살 것. 그게 「오늘의 픽」 카드다.
 *   진행 중(open)  = 이미 산 것. 매일 값이 바뀌는 건 이쪽이다.
 *
 * 모양은 **항목 헤더가 있는 표**다(2026-08-22 Victor — "우측에는 항목별로 있어야
 * 한다는 거야, 그리고 그 아래로 종목을 리스트 하라고"). 카드로도 만들어 봤는데,
 * 카드는 한 건을 «깊게» 보는 형태라 여러 건을 «비교»하기 어렵다. 보유 픽은 오늘 어느
 * 것이 위험한지 훑는 화면이므로 같은 항목이 세로로 줄 맞춰 서야 한다.
 *
 * 정렬은 getOpenPicks 가 «손절에 가까운 순»으로 준다 — 오늘 봐야 할 게 위로 온다.
 */

/** 손절까지 남은 거리 문구. toStopPct 는 롱에서 음수이고 0 에 가까울수록 코앞. */
function stopSub(toStopPct: number | null): string {
  if (toStopPct == null) return "전량 매도";
  const pct = fmtPct(toStopPct);
  return toStopPct >= -0.03 ? `${pct} · 코앞` : `${pct} 남음`;
}

const HEADS = [
  "종목",
  "현재가",
  "진입가",
  "현재 손익률",
  "손절가",
  "본전 도달가",
  "청산 예정일",
  "보유",
];

export function OpenPicksTable({
  picks,
  exitDays,
  pendingCount = 0,
  planDay,
}: {
  picks: OpenPick[];
  /** 종목별 청산 예정일 라벨. 휴장일 표가 못 덮으면 그 종목만 비어 있다. */
  exitDays?: Map<string, string | null>;
  /** 오늘 발행분 중 아직 안 산 건수 — 빈 상태 문구에 쓴다. */
  pendingCount?: number;
  /** 그 대기 픽을 살 날 — "8월 24일(월)". 모르면 null. */
  planDay?: string | null;
}) {
  const won = (v: number) => Math.round(v).toLocaleString("ko-KR");

  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
      {/* ── 폰 (768 미만) — 종목당 카드 ──
          열이 8개다. 폰에서 표로 두면 손절가·본전 도달가가 가로 스크롤 뒤로 숨는데,
          그 둘이 «지금 팔아야 하나»를 판단하는 값이다(2026-08-24 Victor 의 폰 화면).
          홈의 「오늘의 픽」과 같은 규칙이다 — 두 표는 같은 것을 다른 시점에서 본다. */}
      <div className="md:hidden">
        {picks.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[13px] font-semibold text-text">아직 진행중인 픽이 없습니다</p>
            <p className="mt-1 text-[12px] text-text-mute">
              {pendingCount > 0
                ? `오늘의 픽 ${pendingCount}건이 ${planDay ?? "다음 거래일"} 시가에 체결되면 여기에 줄이 생깁니다.`
                : "픽이 체결되면 여기에 줄이 생깁니다."}
            </p>
          </div>
        ) : (
          picks.map((p) => {
            const spec = horizonSpec(p.horizon);
            const setupLabel = p.setup
              ? TRADE_SETUP_LABELS[p.setup as keyof typeof TRADE_SETUP_LABELS] ?? p.setup
              : null;
            const near = p.toStopPct != null && p.toStopPct >= -0.03;
            return (
              <article
                key={p.symbol}
                className="border-b border-border-soft px-4 py-4 last:border-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Link
                        href={`/stocks/${p.symbol}`}
                        className="text-[16px] font-bold text-text"
                      >
                        {p.name}
                      </Link>
                      <SymbolCode symbol={p.symbol} className="text-[12px] text-text-mute" />
                      {p.tp1Hit && (
                        <span className="rounded-[4px] bg-pass-soft px-1.5 py-0.5 text-[11px] font-semibold text-pass">
                          본전스톱
                        </span>
                      )}
                      {near && !p.tp1Hit && (
                        <span className="rounded-[4px] bg-bad-soft px-1.5 py-0.5 text-[11px] font-semibold text-bad">
                          손절 코앞
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] text-text-mute">
                      {spec ? `${spec.label} · ${spec.bars}거래일` : "기간 미지정"}
                      {setupLabel && ` · ${setupLabel}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11.5px] text-text-mute">현재 손익</p>
                    <p
                      className={`tnum text-[17px] font-bold ${
                        p.returnPct == null
                          ? "text-text-mute"
                          : p.returnPct >= 0
                            ? "text-good"
                            : "text-bad"
                      }`}
                    >
                      {p.returnPct != null ? fmtPct(p.returnPct) : "—"}
                    </p>
                    <p className="tnum text-[12px] text-text-mute">
                      {p.last != null ? `현재가 ${won(p.last)}` : "현재가 —"}
                    </p>
                  </div>
                </div>

                <dl className="mt-3 divide-y divide-border-soft rounded-[10px] bg-surface-2 px-3">
                  {[
                    {
                      k: "진입가",
                      v: p.entry,
                      note: `${p.asOf.slice(5).replace("-", "/")} 발행`,
                      cls: "text-text-dim",
                    },
                    {
                      k: "손절가",
                      v: p.stop,
                      note: stopSub(p.toStopPct),
                      cls: "text-bad",
                    },
                    {
                      k: "본전 도달가",
                      v: p.target,
                      note: p.tp1Hit
                        ? "도달 — 손절이 본전"
                        : p.toTargetPct != null
                          ? `${fmtPct(p.toTargetPct)} 남음`
                          : "닿으면 손절이 본전으로",
                      cls: "text-good",
                    },
                  ].map((f) => (
                    <div key={f.k} className="flex items-baseline gap-3 py-2.5">
                      <dt className="w-[74px] shrink-0 text-[12.5px] text-text-mute">{f.k}</dt>
                      <dd className={`tnum text-[15px] font-semibold ${f.cls}`}>
                        {f.v != null ? won(f.v) : "—"}
                      </dd>
                      <dd className="ml-auto text-right text-[12px] leading-[1.5] text-text-mute">
                        {f.note}
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="tnum mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-dim">
                  <span>
                    청산 {exitDays?.get(p.symbol) ?? (spec ? `${spec.bars}거래일째` : "—")}
                  </span>
                  <span className="text-text-mute">·</span>
                  <span>
                    보유 {p.heldDays}일
                    {spec && <span className="text-text-mute"> / 상한 {spec.bars}거래일</span>}
                  </span>
                </p>
              </article>
            );
          })
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-[12.5px]">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-[11px] text-text-mute">
              {HEADS.map((h, i) => (
                <th
                  key={h}
                  className={`whitespace-nowrap py-2.5 font-medium ${
                    i === 0 ? "pl-4 pr-3 text-left" : "px-3 text-right"
                  } ${i === HEADS.length - 1 ? "pr-4" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {picks.length === 0 ? (
              // 자리를 «채우려» 하지 않는다. 유령 행("—" 여덟 칸)을 그렸더니 미리보기가
              // 아니라 «고장난 표»로 읽혔다(2026-08-22 Victor — "이게 뭐야?").
              // 헤더는 남기고 본문만 한 줄로 말한다 — 항목이 무엇인지는 헤더가 보여준다.
              <tr>
                <td colSpan={HEADS.length} className="px-4 py-8 text-center">
                  <p className="text-[13px] font-semibold text-text">
                    아직 진행중인 픽이 없습니다
                  </p>
                  <p className="mt-1 text-[12px] text-text-mute">
                    {pendingCount > 0 ? (
                      <>
                        오늘의 픽{" "}
                        <span className="tnum font-semibold text-text-dim">
                          {pendingCount}건
                        </span>
                        이 {planDay ?? "다음 거래일"} 시가에 체결되면 여기에 줄이 생깁니다.
                      </>
                    ) : (
                      "픽이 체결되면 여기에 줄이 생깁니다."
                    )}
                  </p>
                </td>
              </tr>
            ) : (
              picks.map((p) => {
                const spec = horizonSpec(p.horizon);
                const setupLabel = p.setup
                  ? TRADE_SETUP_LABELS[p.setup as keyof typeof TRADE_SETUP_LABELS] ??
                    p.setup
                  : null;
                const near = p.toStopPct != null && p.toStopPct >= -0.03;
                return (
                  <tr
                    key={p.symbol}
                    className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                  >
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <Link
                          href={`/stocks/${p.symbol}`}
                          className="text-[13.5px] font-bold text-text hover:text-accent"
                        >
                          {p.name}
                        </Link>
                        <SymbolCode symbol={p.symbol} className="text-[10.5px] text-text-mute" />
                        {/* 본전스톱으로 전환된 픽 — 이 시점부터 손절선이 진입가다. */}
                        {p.tp1Hit && (
                          <span className="rounded-[4px] bg-pass-soft px-1.5 py-px text-[10px] font-semibold text-pass">
                            본전스톱
                          </span>
                        )}
                        {near && !p.tp1Hit && (
                          <span className="rounded-[4px] bg-bad-soft px-1.5 py-px text-[10px] font-semibold text-bad">
                            손절 코앞
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10.5px] text-text-mute">
                        {spec ? `${spec.label} · ${spec.bars}거래일` : "기간 미지정"}
                        {setupLabel && ` · ${setupLabel}`}
                      </p>
                    </td>
                    <td className="tnum px-3 py-3 text-right font-semibold text-text">
                      {p.last != null ? won(p.last) : "—"}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-text-dim">
                      {p.entry != null ? won(p.entry) : "—"}
                      <span className="block text-[10.5px] text-text-mute">
                        {p.asOf.slice(5).replace("-", "/")} 발행
                      </span>
                    </td>
                    <td
                      className={`tnum px-3 py-3 text-right font-bold ${
                        p.returnPct == null
                          ? "text-text-mute"
                          : p.returnPct >= 0
                            ? "text-good"
                            : "text-bad"
                      }`}
                    >
                      {p.returnPct != null ? fmtPct(p.returnPct) : "—"}
                      {p.entry != null && p.last != null && (
                        <span className="block text-[10.5px] font-normal text-text-mute">
                          1주당 {p.last - p.entry >= 0 ? "+" : ""}
                          {won(p.last - p.entry)}원
                        </span>
                      )}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-bad">
                      {p.stop != null ? won(p.stop) : "—"}
                      <span
                        className={`block text-[10.5px] ${
                          near ? "font-semibold text-bad" : "text-text-mute"
                        }`}
                      >
                        {stopSub(p.toStopPct)}
                      </span>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-good">
                      {p.target != null ? won(p.target) : "—"}
                      <span className="block text-[10.5px] font-normal text-text-mute">
                        {p.tp1Hit
                          ? "도달 — 손절이 본전"
                          : p.toTargetPct != null
                            ? `${fmtPct(p.toTargetPct)} 남음`
                            : "닿으면 손절이 본전으로"}
                      </span>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-text">
                      {exitDays?.get(p.symbol) ?? (spec ? `${spec.bars}거래일째` : "—")}
                      <span className="block text-[10.5px] text-text-mute">
                        그날 종가에 전량
                      </span>
                    </td>
                    <td className="tnum py-3 pl-3 pr-4 text-right text-text-dim">
                      {p.heldDays}일
                      {spec && (
                        <span className="block text-[10.5px] text-text-mute">
                          상한 {spec.bars}거래일
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {picks.length > 0 && (
        <p className="border-t border-border-soft px-4 py-2.5 text-[12px] text-text-mute">
          손절까지가 0에 가까울수록 코앞입니다 · 본전 도달가에 닿으면 손절이 진입가로
          올라가 그 뒤로는 손해 구간이 사라집니다
        </p>
      )}
    </div>
  );
}
