import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";

import { TRADE_SETUP_LABELS } from "@stock-alpha/db";
import type { LatestPrice, NewsEvent } from "@/lib/data";
import type { RecommendationView } from "@/lib/types";
import { fmtPct } from "@/lib/format";
import { horizonSpec } from "@/lib/holding";
import { computePositionSizePct } from "@/lib/position";

/**
 * 홈 「오늘의 픽」 — 넓은 화면은 표, 폰은 카드.
 *
 * 왜 홈에 레벨까지 놓는가 (2026-08-22 Victor) — 예전 홈은 종목명·기간·셋업만 보여주는
 * «미리보기»였고 진입가·손절가는 /focus 로 넘겼다. 픽이 하루 0~1건인 지금 그렇게
 * 가르면 홈이 «오리온이 있다»만 말하고 끝난다.
 *
 * ⚠️ 모양이 네 번 바뀌었다. 남긴다:
 *   1차 카드 + 「어떻게 읽나」 4줄  → 숫자와 설명이 떨어져 서로를 못 가리킴.
 *   2차 카드, 칸마다 설명 두 줄     → "텍스트가 너무 많아 가독성이 떨어진다".
 *   3차 카드, 표는 숫자만          → 여러 건을 «비교»할 수 없다.
 *   4차 항목 헤더 표               → 넓은 화면에서는 맞았는데 **폰에서 무너졌다**.
 *   지금 — 폭에 따라 둘로 나눈다.
 *
 * ## 폰에서 표를 쓰지 않는 이유 (2026-08-24 Victor 의 갤럭시 Z 폴드 화면)
 *
 * 열이 8개다. 폰에서는 `min-w-[760px]` 이 걸려 가로 스크롤이 되는데, 첫 화면에 보이는
 * 것은 종목·현재가·진입가·손절가까지고 **목표가부터는 옆으로 밀어야** 나왔다.
 * 「손절이 고점 추격으로 바뀌는 지점」은 이 제품의 매매 규칙에서 가장 중요한 값이라
 * 스크롤 뒤에 숨으면 안 된다.
 *
 * 그래서 폰에서는 종목당 카드 한 장에 세 값(진입·손절·본전)을 세로로 세우고, 나머지
 * (청산 기한·비중·리스크)를 아래 한 줄로 묶는다. 값 옆의 설명은 표에서 쓰던 10.5px 이
 * 아니라 12px 다 — 폰에서 10.5px 은 읽으라고 둔 크기가 아니다.
 *
 * 매매 규칙은 행마다 반복하지 않고 아래 한 줄로 둔다 — 모든 픽에 **같은** 규칙이
 * 적용되므로 행에 넣으면 그 줄만 N번 복제된다.
 */

const HEADS = [
  "종목",
  "현재가",
  "진입가",
  "손절가",
  "목표가",
  "청산 기한",
  "권장 비중",
  "1주당 리스크",
];

const won = (v: number) => Math.round(v).toLocaleString("ko-KR");

/** 한 픽에서 화면이 쓰는 값 — 표와 카드가 **같은 계산**을 보게 한 번만 만든다. */
function derive(
  p: RecommendationView,
  opts: {
    prices?: Map<string, LatestPrice> | null;
    news?: Map<string, NewsEvent[]> | null;
    exitDays?: Map<number, string | null>;
    riskPct: number;
  },
) {
  const spec = horizonSpec(p.horizon);
  const setupLabel = p.setup
    ? TRADE_SETUP_LABELS[p.setup as keyof typeof TRADE_SETUP_LABELS] ?? p.setup
    : null;
  const entry = p.entry_price;
  const stop = p.stop_loss;
  const target = p.target_price;
  return {
    p,
    spec,
    setupLabel,
    px: opts.prices?.get(p.symbol) ?? null,
    evs: opts.news?.get(p.symbol) ?? [],
    entry,
    stop,
    target,
    // 목표 수익률은 진입가 대비다. 진입 전이라 «상승여력»과 같은 값이지만, 이 값은
    // 파는 값이 아니라 손절이 추격으로 바뀌는 지점까지의 거리다.
    toTarget: entry != null && entry > 0 && target != null ? target / entry - 1 : null,
    stopPct: entry != null && entry > 0 && stop != null ? stop / entry - 1 : null,
    // 1주당 리스크 = 진입가 − 손절가. 실제로 거는 돈이다.
    risk: entry != null && stop != null ? entry - stop : null,
    // 권장 비중은 DB 의 weight 가 아니라 읽는 시점 계산이다 — 엔진은 사용자 무관한
    // 값만 저장하고 weight 는 null 로 둔다(그대로 찍으면 0.0%).
    sizePct: computePositionSizePct(entry, stop, opts.riskPct),
    exitDay: spec ? opts.exitDays?.get(spec.bars) ?? null : null,
  };
}

type Row = ReturnType<typeof derive>;

/** 최근 보도 — 제목·본문·외부 링크는 쓰지 않는다(언론사 저작물).
 *  «같은 날 여러 매체가 동시에 다뤘다»는 사실만 세고 그날 등락을 붙인다.
 *  ⚠️ «왜 샀나»가 아니라 «무슨 일이 있었나»다. 뉴스는 매수 신호가 아니다(PEAD -0.02). */
function Coverage({ evs, size }: { evs: NewsEvent[]; size: string }) {
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${size} text-text-mute`}>
      <span>보도</span>
      {evs.length === 0 ? (
        <span>최근 10일 없음</span>
      ) : (
        evs.slice(0, 2).map((e) => (
          <span key={e.date} className="tnum">
            {e.date.slice(5).replace("-", "/")} {e.outletCount}개
            {e.changePct != null && (
              <span className={e.changePct >= 0 ? " text-good" : " text-bad"}>
                {" "}
                {fmtPct(e.changePct)}
              </span>
            )}
          </span>
        ))
      )}
    </p>
  );
}

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
  const rows = picks.map((p) => derive(p, { prices, news, exitDays, riskPct }));
  const entryNote = planDay ? `${planDay} 시가` : "다음 거래일 시가";

  const empty = (
    <div className="px-4 py-8 text-center">
      <p className="text-[13px] font-semibold text-text">오늘 기준을 통과한 픽이 없습니다</p>
      <p className="mt-1 text-[12px] text-text-mute">
        억지로 채우지 않습니다. 쉬는 것도 판단입니다.
      </p>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
      {/* ── 폰 (768 미만) — 종목당 카드 한 장 ── */}
      <div className="md:hidden">
        {rows.length === 0
          ? empty
          : rows.map((r) => (
              <article
                key={r.p.symbol}
                className="border-b border-border-soft px-4 py-4 last:border-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Link
                        href={`/stocks/${r.p.symbol}`}
                        className="text-[16px] font-bold text-text"
                      >
                        {r.p.name}
                      </Link>
                      <SymbolCode symbol={r.p.symbol} className="text-[12px] text-text-mute" />
                    </div>
                    <p className="mt-1 text-[12px] leading-[1.6] text-text-mute">
                      {r.spec ? `${r.spec.label} · ${r.spec.bars}거래일` : "기간 미지정"}
                      {r.setupLabel && ` · ${r.setupLabel}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11.5px] text-text-mute">현재가</p>
                    <p className="tnum text-[16px] font-bold text-text">
                      {r.px?.close != null ? won(r.px.close) : "—"}
                    </p>
                    {r.px?.changePct != null && (
                      <p
                        className={`tnum text-[12px] ${
                          r.px.changePct >= 0 ? "text-good" : "text-bad"
                        }`}
                      >
                        {fmtPct(r.px.changePct)}
                      </p>
                    )}
                  </div>
                </div>

                {/* 세 값이 이 제품의 매매 규칙 전부다 — 폰에서 스크롤 뒤로 숨기지 않는다. */}
                <dl className="mt-3 divide-y divide-border-soft rounded-[10px] bg-surface-2 px-3">
                  {[
                    {
                      k: "진입가",
                      v: r.entry,
                      note: entryNote,
                      cls: "text-text",
                    },
                    {
                      k: "손절가",
                      v: r.stop,
                      note: r.stopPct != null ? `${fmtPct(r.stopPct)} · 전량 매도` : "전량 매도",
                      cls: "text-bad",
                    },
                    {
                      k: "목표가",
                      v: r.target,
                      note:
                        r.toTarget != null
                          ? `${fmtPct(r.toTarget)} · 손절이 본전으로`
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
                    청산 {r.exitDay ?? (r.spec ? `${r.spec.bars}거래일째` : "—")}
                  </span>
                  <span className="text-text-mute">·</span>
                  <span>
                    비중 {r.sizePct != null ? `${r.sizePct.toFixed(1)}%` : "—"}
                    <span className="text-text-mute"> (계좌 리스크 {riskPct}%)</span>
                  </span>
                  <span className="text-text-mute">·</span>
                  <span>1주 리스크 {r.risk != null ? `${won(r.risk)}원` : "—"}</span>
                </p>
                <div className="mt-1.5">
                  <Coverage evs={r.evs} size="text-[12px]" />
                </div>
              </article>
            ))}
      </div>

      {/* ── 태블릿·데스크톱 (768 이상) — 항목 헤더 표 ──
          픽이 여러 건인 날 같은 항목이 세로로 줄 맞춰 서야 어느 게 비중이 크고 어느 게
          손절이 먼지 한눈에 잡힌다. 그건 폭이 있을 때만 성립한다. */}
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={HEADS.length}>{empty}</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.p.symbol}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                >
                  <td className="py-3 pl-4 pr-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Link
                        href={`/stocks/${r.p.symbol}`}
                        className="text-[13.5px] font-bold text-text hover:text-accent"
                      >
                        {r.p.name}
                      </Link>
                      <SymbolCode symbol={r.p.symbol} className="text-[10.5px] text-text-mute" />
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-text-mute">
                      {r.spec ? `${r.spec.label} · ${r.spec.bars}거래일` : "기간 미지정"}
                      {r.setupLabel && ` · ${r.setupLabel}`}
                    </p>
                    <div className="mt-1">
                      <Coverage evs={r.evs} size="text-[10.5px]" />
                    </div>
                  </td>
                  <td className="tnum px-3 py-3 text-right font-semibold text-text">
                    {r.px?.close != null ? won(r.px.close) : "—"}
                    {r.px?.changePct != null && (
                      <span
                        className={`block text-[10.5px] font-normal ${
                          r.px.changePct >= 0 ? "text-good" : "text-bad"
                        }`}
                      >
                        {fmtPct(r.px.changePct)}
                      </span>
                    )}
                  </td>
                  <td className="tnum px-3 py-3 text-right text-text">
                    {r.entry != null ? won(r.entry) : "—"}
                    <span className="block text-[10.5px] text-text-mute">{entryNote}</span>
                  </td>
                  <td className="tnum px-3 py-3 text-right text-bad">
                    {r.stop != null ? won(r.stop) : "—"}
                    <span className="block text-[10.5px] text-text-mute">
                      {r.stopPct != null ? `${fmtPct(r.stopPct)} · 전량 매도` : "전량 매도"}
                    </span>
                  </td>
                  <td className="tnum px-3 py-3 text-right text-good">
                    {r.target != null ? won(r.target) : "—"}
                    <span className="block text-[10.5px] text-text-mute">
                      {r.toTarget != null
                        ? `${fmtPct(r.toTarget)} · 손절이 본전으로`
                        : "닿으면 손절이 본전으로"}
                    </span>
                  </td>
                  <td className="tnum px-3 py-3 text-right text-text">
                    {r.exitDay ?? (r.spec ? `${r.spec.bars}거래일째` : "—")}
                    <span className="block text-[10.5px] text-text-mute">그날 종가에 전량</span>
                  </td>
                  <td className="tnum px-3 py-3 text-right text-text">
                    {r.sizePct != null ? `${r.sizePct.toFixed(1)}%` : "—"}
                    <span className="block text-[10.5px] text-text-mute">
                      계좌 리스크 {riskPct}%
                    </span>
                  </td>
                  <td className="tnum py-3 pl-3 pr-4 text-right text-text-dim">
                    {r.risk != null ? `${won(r.risk)}원` : "—"}
                    <span className="block text-[10.5px] text-text-mute">진입 − 손절</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 매매 규칙 — 모든 픽에 같은 규칙이 적용되므로 행마다 반복하지 않는다. */}
      {rows.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-4 py-2.5 text-[12px] text-text-dim">
          <span className="font-semibold text-text">
            {planDay ? `${planDay} 시가 매수` : "다음 거래일 시가 매수"}
          </span>
          <span className="text-text-mute">→</span>
          <span>목표가에 닿으면 팔지 않고 손절을 «고점 − 1R» 로 올림</span>
          <span className="text-text-mute">→</span>
          <span>손절 닿으면 전량 매도</span>
          <span className="text-text-mute">→</span>
          <span>청산 기한 종가에 전량 매도</span>
        </p>
      )}
    </div>
  );
}
