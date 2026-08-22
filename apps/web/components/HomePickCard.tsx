import Link from "next/link";

import { TRADE_SETUP_LABELS } from "@stock-alpha/db";
import type { LatestPrice, NewsEvent } from "@/lib/data";
import type { RecommendationView } from "@/lib/types";
import { fmtPct } from "@/lib/format";
import { horizonSpec } from "@/lib/holding";
import { computePositionSizePct } from "@/lib/position";

/**
 * 홈의 「오늘의 픽」 실행 카드.
 *
 * 왜 홈에 레벨까지 놓는가 (2026-08-22 Victor 결정) — 예전 홈 카드는 종목명·코드·기간·
 * 셋업만 보여주는 «미리보기»였고 진입가·목표가·손절가는 /focus 로 넘겼다. 그런데 픽이
 * 하루 0~1건인 지금 그렇게 가르면 홈은 «오리온이 있다»만 말하고 끝나고, 정작 중요한
 * 것(얼마에 사고·어디서 팔고·얼마나 사나)이 한 번 더 눌러야 나왔다.
 *
 * ⚠️ 읽기 규칙 (2026-08-22 Victor, 두 번 고침)
 *   1차 — 「어떻게 읽나」를 카드 아래 4줄로 뺐다 → 숫자와 설명이 떨어져 서로를 못 가리킴.
 *   2차 — 그래서 칸마다 설명을 두 줄씩 달았다 → "텍스트가 너무 많아 가독성이 떨어진다".
 *   지금 — **표는 숫자만** 담고(라벨·값·10자 이내 보조), 매매 규칙은 표 아래 **한 줄**로
 *   흐름을 잇는다. 규칙은 칸별로 흩어질 성질이 아니라 «사고 → 올리고 → 팔고» 하나의
 *   순서이기 때문이다.
 */

function Cell({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "up" | "down";
}) {
  const valueCls =
    tone === "up" ? "text-good" : tone === "down" ? "text-bad" : "text-text";
  return (
    <div className="bg-surface px-3.5 py-2.5">
      <p className="text-[11px] text-text-mute">{label}</p>
      <p className={`tnum mt-0.5 text-[17px] font-bold leading-tight ${valueCls}`}>
        {value}
      </p>
      {sub && <p className="tnum mt-0.5 text-[11px] text-text-mute">{sub}</p>}
    </div>
  );
}

export function HomePickCard({
  pick,
  price,
  planDay,
  exitDay,
  riskPct,
  events,
}: {
  pick: RecommendationView;
  price: LatestPrice | null;
  /** 최근 10일 보도 사건 — 같은 날 2개 이상 매체가 다룬 것만. */
  events?: NewsEvent[];
  /** 진입 예정일 라벨 — "8월 24일(월)". 휴장일 표가 못 덮으면 null. */
  planDay: string | null;
  /** 청산 기한 라벨 — 진입 후 N거래일째. 표가 못 덮으면 null. */
  exitDay: string | null;
  /** 계좌 리스크 상한 % — 권장 비중을 역산한 기준. */
  riskPct: number;
}) {
  const spec = horizonSpec(pick.horizon);
  const setupLabel = pick.setup
    ? TRADE_SETUP_LABELS[pick.setup as keyof typeof TRADE_SETUP_LABELS] ?? pick.setup
    : null;

  const entry = pick.entry_price;
  const target = pick.target_price;
  const stop = pick.stop_loss;
  const last = price?.close ?? null;

  const stopPct = last != null && last > 0 && stop != null ? stop / last - 1 : null;
  // 1주당 리스크 = 진입가 − 손절가. 실제로 거는 돈이다.
  //
  // 예전엔 여기에 「손익비 2.6R」과 「상승여력 +8.6%」을 뒀는데 둘 다 «목표가에서
  // 판다»를 전제한 값이라, 목표에서 팔지 않는 지금 규칙에서는 실현되지 않는 숫자였다
  // (2026-08-22 Victor 지적). 2차 목표도 같은 이유로 뺐다 — trail 경로는 tp 를 하나만
  // 쓴다(_exit_scalein). 남은 건 «내가 얼마를 거는가»뿐이고, 그건 정확하다.
  const risk = entry != null && stop != null ? entry - stop : null;
  // 권장 비중은 DB 의 weight 가 아니라 «읽는 시점 계산»이다. 엔진은 사용자와 무관한
  // 값만 저장하고 weight 는 null 로 둔다 — 비중은 그 사람의 risk_per_trade_pct 에
  // 달렸기 때문이다. pick.weight 를 그대로 찍었더니 0.0% 가 나왔다(2026-08-22).
  const sizePct = computePositionSizePct(entry, stop, riskPct);

  const won = (v: number) => Math.round(v).toLocaleString("ko-KR");

  return (
    <li className="overflow-hidden rounded-[12px] border border-border bg-surface">
      {/* 머리 — 기간 · 종목 · 셋업 · 현재가 */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 pb-2.5 pt-3.5">
        {spec && (
          <span className="rounded-[999px] bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
            {spec.label} · {spec.bars}거래일
          </span>
        )}
        <Link
          href={`/stocks/${pick.symbol}`}
          className="text-[19px] font-bold tracking-[-0.2px] text-text hover:text-accent"
        >
          {pick.name}
        </Link>
        <span className="text-[11px] text-text-mute">{pick.symbol}</span>
        {setupLabel && (
          <span className="rounded-[999px] bg-surface-3 px-2 py-0.5 text-[11px] text-text-dim">
            {setupLabel}
          </span>
        )}
        {last != null && (
          <span className="tnum ml-auto text-[12px] text-text-dim">
            현재 {won(last)}원
            {price?.changePct != null && (
              <span className={price.changePct >= 0 ? " text-good" : " text-bad"}>
                {" "}
                {fmtPct(price.changePct)}
              </span>
            )}
          </span>
        )}
      </div>

      {/* 표 — 숫자만. 보조는 10자 이내. */}
      <div className="grid gap-px border-y border-border bg-border grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <Cell
          label="진입가"
          value={entry != null ? won(entry) : "—"}
          sub={planDay ? `${planDay} 시가` : "다음 거래일 시가"}
        />
        <Cell
          label="손절가"
          tone="down"
          value={stop != null ? won(stop) : "—"}
          sub={stopPct != null ? `${fmtPct(stopPct)} · 전량 매도` : "전량 매도"}
        />
        <Cell
          label="본전 도달가"
          tone="up"
          value={target != null ? won(target) : "—"}
          sub="닿으면 손절이 본전으로"
        />
        <Cell
          label="청산 기한"
          value={exitDay ?? (spec ? `${spec.bars}거래일` : "—")}
          sub="그날 종가에 전량"
        />
        <Cell
          label="권장 비중"
          value={sizePct != null ? `${sizePct.toFixed(1)}%` : "—"}
          sub={`계좌 리스크 ${riskPct}%`}
        />
        <Cell
          label="1주당 리스크"
          value={risk != null ? `${won(risk)}원` : "—"}
          sub="진입 − 손절"
        />
      </div>

      {/* 매매 규칙 — 칸에 흩지 않고 한 줄로 잇는다. «사고 → 올리고 → 팔고» 순서다. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-[12px] text-text-dim">
        <span className="text-text">
          {planDay ? `${planDay} 시가 매수` : "다음 거래일 시가 매수"}
        </span>
        <span className="text-text-mute">→</span>
        <span>
          {target != null ? `${won(target)} 닿으면` : "본전 도달가에 닿으면"} 손절을{" "}
          {entry != null ? `${won(entry)}(본전)` : "본전"}으로 올림
        </span>
        <span className="text-text-mute">→</span>
        <span>손절 닿으면 전량 매도</span>
        <span className="text-text-mute">→</span>
        <span>{exitDay ?? `${spec?.bars ?? "-"}거래일째`} 종가에 전량 매도</span>
      </div>

      {/* ── 최근 보도 ──
          기사 제목·본문은 쓰지 않는다(언론사 저작물). 외부 링크도 없다. «같은 날 여러
          매체가 동시에 다뤘다»는 사실만 세고 그 옆에 그날 등락을 붙인다 —
          components/RecentCoverage 와 같은 규약이다.

          ⚠️ 이건 «왜 샀나»가 아니라 «무슨 일이 있었나»다. 뉴스는 매수 신호가 아니다
          (PEAD 실측 -0.02). 그래서 픽 근거 표(위)와 줄을 갈라 아래에 둔다. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border px-4 py-2.5 text-[11px]">
        <span className="shrink-0 font-semibold text-text-dim">최근 보도</span>
        {!events || events.length === 0 ? (
          <span className="text-text-mute">최근 10일 눈에 띄는 보도 없음</span>
        ) : (
          events.slice(0, 3).map((e) => (
            <span key={e.date} className="flex items-baseline gap-1.5">
              <span className="tnum text-text-mute">
                {e.date.slice(5).replace("-", "/")}
              </span>
              <span className="rounded-[4px] bg-surface-2 px-1.5 py-px font-semibold text-text-dim">
                {e.outletCount}개 매체
              </span>
              {e.changePct != null && (
                <span
                  className={`tnum font-medium ${
                    e.changePct >= 0 ? "text-good" : "text-bad"
                  }`}
                >
                  {fmtPct(e.changePct)}
                </span>
              )}
            </span>
          ))
        )}
        <Link
          href={`/stocks/${pick.symbol}`}
          className="ml-auto shrink-0 font-semibold text-accent hover:underline"
        >
          종목 분석 →
        </Link>
      </div>
    </li>
  );
}
