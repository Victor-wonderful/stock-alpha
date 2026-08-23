import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";

import { TRADE_SETUP_LABELS } from "@stock-alpha/db";
import type { LatestPrice, NewsEvent } from "@/lib/data";
import type { RecommendationView } from "@/lib/types";
import { fmtPct } from "@/lib/format";
import { horizonSpec } from "@/lib/holding";
import { computePositionSizePct } from "@/lib/position";

/**
 * 홈 「오늘의 픽」 — 항목 헤더가 있는 표.
 *
 * 왜 홈에 레벨까지 놓는가 (2026-08-22 Victor) — 예전 홈은 종목명·기간·셋업만 보여주는
 * «미리보기»였고 진입가·손절가는 /focus 로 넘겼다. 픽이 하루 0~1건인 지금 그렇게
 * 가르면 홈이 «오리온이 있다»만 말하고 끝난다.
 *
 * ⚠️ 모양이 세 번 바뀌었다. 남긴다:
 *   1차 카드 + 「어떻게 읽나」 4줄  → 숫자와 설명이 떨어져 서로를 못 가리킴.
 *   2차 카드, 칸마다 설명 두 줄     → "텍스트가 너무 많아 가독성이 떨어진다".
 *   3차 카드, 표는 숫자만          → 여러 건을 «비교»할 수 없다.
 *   지금 — 「진행 중」과 같은 **항목 헤더 표**. 픽이 여러 건인 날 같은 항목이 세로로
 *   줄 맞춰 서야 어느 게 비중이 크고 어느 게 손절이 먼지 한눈에 잡힌다.
 *
 * 매매 규칙은 행마다 반복하지 않고 표 아래 한 줄로 둔다 — 모든 픽에 **같은** 규칙이
 * 적용되므로 행에 넣으면 그 줄만 N번 복제된다.
 */

const HEADS = [
  "종목",
  "현재가",
  "진입가",
  "손절가",
  "본전 도달가",
  "청산 기한",
  "권장 비중",
  "1주당 리스크",
];

export function HomePicksTable({
  picks,
  prices,
  news,
  planDay,
  exitDays,
  riskPct,
}: {
  picks: RecommendationView[];
  prices?: Map<string, LatestPrice> | null;
  /** 종목별 최근 10일 보도 사건 — 같은 날 2개 이상 매체가 다룬 것만. */
  news?: Map<string, NewsEvent[]> | null;
  /** 진입 예정일 라벨 — "8월 24일(월)". 휴장일 표가 못 덮으면 null. */
  planDay: string | null;
  /** 기간(bars)별 청산 기한 라벨. 표가 못 덮으면 그 기간만 비어 있다. */
  exitDays?: Map<number, string | null>;
  /** 계좌 리스크 상한 % — 권장 비중을 역산한 기준. */
  riskPct: number;
}) {
  const won = (v: number) => Math.round(v).toLocaleString("ko-KR");

  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
      <div className="overflow-x-auto">
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
              <tr>
                <td colSpan={HEADS.length} className="px-4 py-8 text-center">
                  <p className="text-[13px] font-semibold text-text">
                    오늘 기준을 통과한 픽이 없습니다
                  </p>
                  <p className="mt-1 text-[12px] text-text-mute">
                    억지로 채우지 않습니다. 쉬는 것도 판단입니다.
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
                const px = prices?.get(p.symbol) ?? null;
                const evs = news?.get(p.symbol) ?? [];
                const entry = p.entry_price;
                const stop = p.stop_loss;
                const target = p.target_price;
                // 목표 수익률은 진입가 대비다. 진입 전이라 «상승여력»과 같은 값이지만,
                // 이 값은 파는 값이 아니라 손절이 본전으로 올라가는 지점까지의 거리다.
                const toTarget =
                  entry != null && entry > 0 && target != null ? target / entry - 1 : null;
                const stopPct =
                  entry != null && entry > 0 && stop != null ? stop / entry - 1 : null;
                // 1주당 리스크 = 진입가 − 손절가. 실제로 거는 돈이다.
                const risk = entry != null && stop != null ? entry - stop : null;
                // 권장 비중은 DB 의 weight 가 아니라 읽는 시점 계산이다 — 엔진은 사용자
                // 무관한 값만 저장하고 weight 는 null 로 둔다(그대로 찍으면 0.0%).
                const sizePct = computePositionSizePct(entry, stop, riskPct);
                const exitDay = spec ? exitDays?.get(spec.bars) ?? null : null;

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
                      </div>
                      <p className="mt-0.5 text-[10.5px] text-text-mute">
                        {spec ? `${spec.label} · ${spec.bars}거래일` : "기간 미지정"}
                        {setupLabel && ` · ${setupLabel}`}
                      </p>
                      {/* ── 최근 보도 ──
                          기사 제목·본문은 쓰지 않는다(언론사 저작물). 외부 링크도 없다.
                          «같은 날 여러 매체가 동시에 다뤘다»는 사실만 세고 그 옆에 그날
                          등락을 붙인다 — components/RecentCoverage 와 같은 규약이다.
                          ⚠️ «왜 샀나»가 아니라 «무슨 일이 있었나»다. 뉴스는 매수 신호가
                          아니다(PEAD 실측 -0.02). */}
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[10.5px] text-text-mute">
                        <span>보도</span>
                        {evs.length === 0 ? (
                          <span>최근 10일 없음</span>
                        ) : (
                          evs.slice(0, 2).map((e) => (
                            <span key={e.date} className="tnum">
                              {e.date.slice(5).replace("-", "/")} {e.outletCount}개
                              {e.changePct != null && (
                                <span
                                  className={
                                    e.changePct >= 0 ? " text-good" : " text-bad"
                                  }
                                >
                                  {" "}
                                  {fmtPct(e.changePct)}
                                </span>
                              )}
                            </span>
                          ))
                        )}
                      </p>
                    </td>
                    <td className="tnum px-3 py-3 text-right font-semibold text-text">
                      {px?.close != null ? won(px.close) : "—"}
                      {px?.changePct != null && (
                        <span
                          className={`block text-[10.5px] font-normal ${
                            px.changePct >= 0 ? "text-good" : "text-bad"
                          }`}
                        >
                          {fmtPct(px.changePct)}
                        </span>
                      )}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-text">
                      {entry != null ? won(entry) : "—"}
                      <span className="block text-[10.5px] text-text-mute">
                        {planDay ? `${planDay} 시가` : "다음 거래일 시가"}
                      </span>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-bad">
                      {stop != null ? won(stop) : "—"}
                      <span className="block text-[10.5px] text-text-mute">
                        {stopPct != null ? `${fmtPct(stopPct)} · 전량 매도` : "전량 매도"}
                      </span>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-good">
                      {target != null ? won(target) : "—"}
                      <span className="block text-[10.5px] text-text-mute">
                        {toTarget != null
                          ? `${fmtPct(toTarget)} · 손절이 본전으로`
                          : "닿으면 손절이 본전으로"}
                      </span>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-text">
                      {exitDay ?? (spec ? `${spec.bars}거래일째` : "—")}
                      <span className="block text-[10.5px] text-text-mute">
                        그날 종가에 전량
                      </span>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-text">
                      {sizePct != null ? `${sizePct.toFixed(1)}%` : "—"}
                      <span className="block text-[10.5px] text-text-mute">
                        계좌 리스크 {riskPct}%
                      </span>
                    </td>
                    <td className="tnum py-3 pl-3 pr-4 text-right text-text-dim">
                      {risk != null ? `${won(risk)}원` : "—"}
                      <span className="block text-[10.5px] text-text-mute">
                        진입 − 손절
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 매매 규칙 — 모든 픽에 같은 규칙이 적용되므로 행마다 반복하지 않는다. */}
      {picks.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-4 py-2.5 text-[11.5px] text-text-dim">
          <span className="font-semibold text-text">
            {planDay ? `${planDay} 시가 매수` : "다음 거래일 시가 매수"}
          </span>
          <span className="text-text-mute">→</span>
          <span>본전 도달가에 닿으면 팔지 않고 손절을 진입가로 올림</span>
          <span className="text-text-mute">→</span>
          <span>손절 닿으면 전량 매도</span>
          <span className="text-text-mute">→</span>
          <span>청산 기한 종가에 전량 매도</span>
        </p>
      )}
    </div>
  );
}
