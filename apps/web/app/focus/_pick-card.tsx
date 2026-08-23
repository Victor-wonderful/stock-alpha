import Link from "next/link";
import { SymbolCode } from "@/components/SymbolCode";
import { fmtPrice, fmtPct } from "@/lib/format";
import { computePositionSizePct } from "@/lib/position";
import { PriceNow } from "@/components/PriceNow";
import { setupCharacter, TONE_CLASS } from "@/lib/setupCharacter";
import {
  holdingLabel,
  holdingApprox,
  horizonLabel,
  exitPlanLines,
  horizonSpec,
} from "@/lib/holding";
import type { BacktestView, RecommendationView, ReportListItem } from "@/lib/types";

/**
 * 픽 카드 — 「사기 전에 읽는 순서」대로 네 칸.
 *
 *   ① 얼마에 사고 어디서 나오나   레벨·비중
 *   ② 왜 이 종목인가              근거 (접지 않는다)
 *   ③ 어떻게 사고 파나            진입 방식·청산 규칙
 *   ④ 이 조합의 검증 성적         승률·기대값·최대낙폭 (신설)
 *
 * ④를 넣은 이유(2026-08-23 Victor 확정) — 예전 카드는 「🛡 검증 통과」 배지 하나로
 * 백테스트를 뭉갰다. 사용자는 «검증했다니까 되겠지»로 읽는다. 이 제품의 축이
 * «맞은 것과 틀린 것을 모두 기록으로 남긴다» 인데 정작 픽 카드가 그걸 안 지켰다.
 * 숫자는 이미 backtests 에 있고 페이지가 이미 불러오고 있었다 — 통과 여부만 보고
 * 성적은 버리고 있었을 뿐이다.
 *
 * 걷어낸 것들:
 *  - 순위 필(①②③) — 기간 구역마다 1번부터 다시 세서 «단기 1번»과 «중기 1번»이
 *    한 화면에 같이 떴다. 하루 1~2건인 지금은 「1」만 덩그러니 남는다.
 *  - entryStatus() — 「지금 진입 타이밍 / 대기 / 무효」 판정. 발행 픽이 전부
 *    «다음 거래일 시가»가 된 뒤(2026-08-21) 단 한 번도 실행되지 않는 코드였다.
 *  - 「펼치기 ▾」 — 근거를 항상 펼쳐두면 버튼이 필요 없다.
 *  - MiniSnowflake — 62px 에 5축을 라벨 없이 그렸다. 「모멘텀 +1.92 우위」라고
 *    글로 쓰는 편이 같은 자리에서 더 많이 말한다.
 *  - RatingBadge — 리포트 시점 게이트라 지금과 어긋난다(추천하면서 「거래 부적합」).
 *  - 「🛡 검증 통과」 배지 — ④가 같은 말을 숫자로 한다.
 *
 * 서버 컴포넌트다 — 접이식을 없애면서 클라이언트 상태가 사라졌다.
 */

/**
 * 근거 문장에서 맨 앞 「오리온 63.5점(거래 부적합)」 마디를 떼어낸다.
 *
 * 두 가지 이유다. (1) 이름과 점수는 카드 머리가 이미 말한다. (2) 괄호 안 등급은
 * 리포트를 만든 날의 게이트로 찍힌 값이라, 게이트가 바뀌면 「추천하면서 거래
 * 부적합」이라는 모순이 그대로 문장에 남는다. 발행 여부는 엔진이 «지금» 기준으로
 * 판단하므로 카드에 실린 픽은 이미 거래 가능 판정을 받은 것이다.
 * 종목 상세(/stocks)는 리포트 원문 그대로 둔다 — 거기선 그날의 판정이 맞다.
 */
function thesisBody(thesis: string | null | undefined, name: string): string | null {
  if (!thesis) return null;
  const head = new RegExp(`^${name}\\s+[\\d.]+점\\([^)]*\\)\\s*·\\s*`);
  // 꼬리의 「· 셋업 double_bottom(swing) …」 마디도 뗀다. 셋업 이름은 카드 머리가
  // 사람 말로(「쌍바닥 반등」) 이미 말했고, 괄호 안 축은 **옛 스타일 축**이라 바로
  // 아래 ④가 말하는 기간 축(중기)과 어긋난다 — 한 카드가 swing 과 중기를 동시에
  // 말하면 어느 쪽 성적인지 되묻게 된다.
  const tail = /\s*·\s*셋업\s+[^·]*$/;
  const body = thesis.replace(head, "").replace(tail, "").trim();
  if (!body) return null;
  return body.endsWith(".") ? body : `${body}.`;
}

function Section({
  label,
  note,
  children,
  tone,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <div className={`border-t border-border px-5 py-3 ${tone === "warn" ? "bg-warn-soft" : ""}`}>
      <p
        className={`mb-2 text-[11px] ${
          tone === "warn" ? "font-semibold text-warn" : "text-text-mute"
        }`}
      >
        {label}
        {note && <span className="font-normal opacity-80"> — {note}</span>}
      </p>
      {children}
    </div>
  );
}

export function PickCard({
  pick,
  report,
  riskPct,
  backtest,
  lastPrice,
  changePct,
  priceDate,
}: {
  pick: RecommendationView & { as_of?: string | null };
  report?: ReportListItem | null;
  riskPct: number;
  /**
   * 이 픽의 (셋업 × 기간) 검증 결과.
   *
   * ⚠️ 반드시 **기간(horizon)** 으로 찾은 행이어야 한다. 스타일로 찾으면 안 된다 —
   * 같은 쌍바닥이라도 옛 스타일 축은 기대값 +0.11R·최근구간 −0.035R 로 **게이트를
   * 통과하지 못했고**, 지금 발행 근거인 기간 축(중기)은 +0.35R 로 통과했다.
   * 스타일 행을 붙이면 통과한 적 없는 조합의 숫자를 「검증 성적」이라며 보여주게 된다.
   */
  backtest?: BacktestView | null;
  lastPrice?: number | null;
  changePct?: number | null;
  priceDate?: string | null;
}) {
  // 레벨 파생값 — 홈 표(HomePicksTable)와 **같은 공식·같은 이름**을 쓴다. 한 종목이
  // 두 화면에서 다른 말을 하면(홈 「본전 도달가」 / 여기 「목표가」) 사용자는 둘 중
  // 하나가 틀렸다고 읽는다. R:R·2차 목표·상승여력은 «목표에서 판다»를 전제한 값이라
  // 지금 규칙(trail: 목표에 닿으면 손절만 본전으로 올림)에서는 실현되지 않는다.
  const entryP = pick.entry_price;
  const stopP = pick.stop_loss;
  const targetP = pick.target_price;
  const stopPct = entryP != null && entryP > 0 && stopP != null ? stopP / entryP - 1 : null;
  const toTarget = entryP != null && entryP > 0 && targetP != null ? targetP / entryP - 1 : null;
  // 1주당 리스크 = 진입가 − 손절가. 실제로 거는 돈이다.
  const riskPerShare = entryP != null && stopP != null ? entryP - stopP : null;
  // 권장 비중은 읽는 시점 계산 — DB 의 weight 는 null 이다(엔진이 안 넣는다).
  const sizePct = computePositionSizePct(entryP, stopP, riskPct);

  // 진입 규칙 — 2026-08-21 부터 발행 픽은 «다음 거래일 시가 시장가»다.
  const awaitingEntry = pick.entry_rule === "next_open" && pick.status === "pending";
  const entryLabel = awaitingEntry ? "예상 진입가" : "진입가";

  const exitLines = exitPlanLines(pick.horizon, {
    tp1: pick.target_price, stop: pick.stop_loss, style: pick.style,
  });
  const hz = horizonSpec(pick.horizon);
  const ch = setupCharacter(pick.setup);
  const body = thesisBody(pick.thesis, pick.name);

  // ④ 검증 성적 — 기대값(R)은 «1R = 1주당 리스크»가 기준이다. 그래서 R 을 원화로
  // 되돌리면 «이 픽에 4,221원을 걸면 한 번당 평균 얼마»가 나온다. 배수보다 원화가
  // 읽힌다 — R 은 우리 말이고 원화는 사용자 말이다.
  const expR = backtest?.expectancy_r ?? null;
  const expWon =
    expR != null && riskPerShare != null ? Math.round(expR * riskPerShare) : null;
  const lossRate = backtest?.win_rate != null ? 1 - backtest.win_rate : null;

  const stats: { label: string; value: string; tone?: string; sub: string }[] = [
    {
      label: entryLabel,
      value: fmtPrice(entryP),
      sub: awaitingEntry ? "다음 거래일 시가" : "시가 매수",
    },
    {
      label: "손절가",
      value: fmtPrice(stopP),
      tone: "text-bad",
      sub: stopPct != null ? `${fmtPct(stopPct)} · 전량 매도` : "전량 매도",
    },
    {
      label: "본전 도달가",
      value: fmtPrice(targetP),
      tone: "text-good",
      sub: toTarget != null ? `${fmtPct(toTarget)} · 손절이 본전으로` : "손절이 본전으로",
    },
    {
      label: "1주당 리스크",
      value:
        riskPerShare != null ? `${Math.round(riskPerShare).toLocaleString("ko-KR")}원` : "—",
      sub: "진입 − 손절",
    },
    {
      label: "권장 비중",
      value: sizePct != null ? `${sizePct.toFixed(1)}%` : "—",
      tone: "text-accent",
      sub: `계좌 리스크 ${riskPct}%`,
    },
  ];

  return (
    <div className="rounded-[16px] border border-border bg-surface">
      {/* ── 머리 — 무엇을 사는가 ── */}
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/stocks/${pick.symbol}`}
              className="text-[15px] font-bold text-text hover:text-accent"
            >
              {pick.name}
            </Link>
            <SymbolCode symbol={pick.symbol} className="text-[10px] text-text-mute" />
            {horizonLabel(pick.horizon) && (
              <span className="rounded-[6px] bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                {horizonLabel(pick.horizon)}
                {hz ? ` · ${hz.bars}거래일` : ""}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASS[ch.tone]}`}
            >
              {ch.icon} {ch.label}
            </span>
          </div>
          <div className="mt-1.5">
            <PriceNow close={lastPrice} changePct={changePct} date={priceDate} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="tnum text-xl font-extrabold text-accent">
            {report?.score != null ? report.score : Math.round(pick.conviction * 100)}
          </span>
          <p className="text-[10px] text-text-mute">종합 점수</p>
        </div>
      </div>

      {/* ── ① 얼마에 사고 어디서 나오나 ── */}
      <Section label="얼마에 사고 어디서 나오나">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 sm:text-center">
          {stats.map(({ label, value, tone, sub }) => (
            <div
              key={label}
              className="rounded-[8px] bg-surface-2 px-2.5 py-2 sm:bg-transparent sm:px-0 sm:py-0"
            >
              <p className="text-[10px] text-text-mute">{label}</p>
              <p className={`tnum mt-0.5 text-[13px] font-bold ${tone ?? "text-text"}`}>{value}</p>
              <p className="tnum mt-0.5 text-[10px] text-text-mute">{sub}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── ② 왜 이 종목인가 — 접지 않는다 ── */}
      {body && (
        <Section label="왜 이 종목인가">
          <p className="text-[12px] leading-relaxed text-text-dim">{body}</p>
          {report && (
            <Link
              href={`/reports/${report.id}`}
              className="mt-1.5 inline-block text-[11px] font-semibold text-accent hover:underline"
            >
              근거 리포트 전체 보기 →
            </Link>
          )}
        </Section>
      )}

      {/* ── ③ 어떻게 사고 파나 ── */}
      <Section label="어떻게 사고 파나">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="font-semibold text-text">
            {hz ? hz.entry : awaitingEntry ? "다음 거래일 시가 매수" : "매수"}
          </span>
          <span className="text-text-mute">→</span>
          <span className="rounded-[6px] bg-surface-2 px-2 py-0.5 font-semibold text-text-dim">
            {holdingLabel(pick.horizon, pick.style)}
          </span>
          {holdingApprox(pick.horizon, pick.style) && (
            <span className="text-text-mute">{holdingApprox(pick.horizon, pick.style)}</span>
          )}
        </div>
        <ul className="space-y-1">
          {exitLines.map((l) => (
            <li key={l.trigger} className="flex gap-2 text-[11px] leading-snug">
              <span className="shrink-0 text-text-dim">{l.trigger}</span>
              <span className="text-text-mute">→</span>
              <span className="text-text-mute">{l.action}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── ④ 이 조합의 검증 성적 ──
           숫자가 없으면 칸을 그리지 않는다. 「—」로 채우면 «측정했는데 0» 처럼
           읽힌다(홈에서 유령 행을 걷어낸 것과 같은 이유). */}
      {backtest && (
        <Section
          label="이 조합의 검증 성적"
          note={`${ch.label} × ${horizonLabel(pick.horizon) ?? "—"}`}
          tone="warn"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                k: "승률",
                v: backtest.win_rate != null ? `${(backtest.win_rate * 100).toFixed(0)}%` : "—",
              },
              { k: "이기면", v: backtest.avg_rr != null ? `${backtest.avg_rr.toFixed(1)}배` : "—" },
              { k: "거래당", v: expR != null ? `${expR >= 0 ? "+" : ""}${expR.toFixed(2)}R` : "—" },
              {
                k: "최대낙폭",
                v: backtest.mdd != null ? `−${(backtest.mdd * 100).toFixed(1)}%` : "—",
              },
            ].map(({ k, v }) => (
              <div key={k} className="text-center">
                <p className="text-[10px] text-warn opacity-80">{k}</p>
                <p className="tnum mt-0.5 text-[13px] font-bold text-warn">{v}</p>
              </div>
            ))}
          </div>
          {/* 사람 말로 한 번 더 — 승률 43% 를 보고 «10번 중 6번은 진다»까지 가는
              사용자는 드물다. 좋은 쪽만 말하지 않는 것이 이 칸의 일이다. */}
          {(lossRate != null || expWon != null) && (
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-warn">
              {lossRate != null && (
                <span className="font-bold">
                  10번 중 {Math.round(lossRate * 10)}번은 손실로 끝납니다.
                </span>
              )}
              {backtest.avg_rr != null && expWon != null && riskPerShare != null && (
                <>
                  {" "}
                  대신 이길 때 {backtest.avg_rr.toFixed(1)}배 벌어서,{" "}
                  {Math.round(riskPerShare).toLocaleString("ko-KR")}원을 걸면 한 번당 평균{" "}
                  <span className="font-bold">
                    {expWon >= 0 ? "+" : ""}
                    {expWon.toLocaleString("ko-KR")}원
                  </span>
                  이 남았습니다.
                </>
              )}
            </p>
          )}
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-warn opacity-80">
            과거 데이터로 잰 값이고 미래 수익을 보장하지 않습니다 · 수수료·세금·슬리피지 반영
            {backtest.walkforward?.evaluable && (
              <>
                {" · "}워크포워드 {backtest.walkforward.ok ? "통과(하위 구간 지속)" : "미통과"}
              </>
            )}
          </p>
        </Section>
      )}
    </div>
  );
}
