// ── 보유기간·청산 계획 ──────────────────────────────────────────────────────
//
// "오늘 사면 오늘 파는 건가, 며칠 들고 가는 건가" — 화면이 이 질문에 답해야 한다.
// 규칙은 진작 정해져 있었는데(엔진이 그대로 자동 청산한다) 어디에도 렌더링되지
// 않아, 사용자는 진입가·목표가·손절가만 보고 보유기간을 알 수 없었다.
//
// ⚠️ 아래 숫자는 엔진의 단일 출처를 **복제**한 것이다:
//     apps/engine/engine/backtest/event_backtest.py  _TIMEOUT_BARS
//     apps/engine/engine/signals/styles.py           StyleConfig
// 엔진에서 바꾸면 여기도 바꿔야 한다. (웹이 봉 수를 계산하지 않으므로 DB로
// 내려보낼 값이 없다 — signals.holding_horizon 은 "days"/"months" 같은 어림말이라
// 화면에 그대로 쓸 수 없다.)

/** 스타일별 최대 보유 «거래일». 이 안에 목표·손절 어느 쪽도 안 오면 종가 청산. */
export const TIMEOUT_BARS: Record<string, number> = {
  scalping: 1,
  day: 1,
  swing: 10,
  position: 60,
};

/** 캘린더 안전망 — 거래정지 등으로 봉이 안 쌓여 봉-타임아웃에 못 닿는 픽의 강제 만료. */
export const PICK_EXPIRE_DAYS = 120;

/** "최대 10거래일" 처럼 한 조각으로 쓰는 라벨. */
export function holdingLabel(style: string | null | undefined): string {
  if (!style) return "보유기간 미상";
  if (style === "day" || style === "scalping") return "당일 청산";
  const bars = TIMEOUT_BARS[style];
  return bars ? `최대 ${bars}거래일` : "보유기간 미상";
}

/** 대략 몇 주/몇 달인지 — 거래일 수만으로는 감이 안 오는 사용자를 위한 보조 표기. */
export function holdingApprox(style: string | null | undefined): string | null {
  if (style === "swing") return "약 2주";
  if (style === "position") return "약 3개월";
  return null;
}

export interface ExitPlanLine {
  trigger: string;
  action: string;
}

/**
 * 청산 계획 — 엔진 resolve_pick_status 와 같은 순서로 쓴다.
 * 넷 중 «먼저 오는 것»으로 자동 확정된다.
 *
 * hasTp2 면 분할 익절이다(0022): 1차 목표에서 절반 익절 → 잔량은 손절선을 본전으로
 * 올리고 2차 목표까지 런. 이걸 안 적어두면 사용자는 목표가에서 전량 파는 걸로
 * 이해한다 — 실제 손익과 어긋난다.
 */
export function exitPlanLines(
  style: string | null | undefined,
  opts: { tp1?: number | null; tp2?: number | null; stop?: number | null } = {},
): ExitPlanLine[] {
  const { tp1, tp2, stop } = opts;
  const bars = style ? TIMEOUT_BARS[style] : undefined;
  const fmt = (v: number | null | undefined) =>
    v == null ? "목표" : Math.round(v).toLocaleString();
  const lines: ExitPlanLine[] = [];

  if (stop != null) {
    lines.push({ trigger: `손절 ${fmt(stop)} 이탈`, action: "전량 청산" });
  }
  if (tp2 != null && tp1 != null) {
    lines.push({
      trigger: `1차 목표 ${fmt(tp1)} 도달`,
      action: "절반 익절 · 남은 절반은 손절선을 본전으로 올림",
    });
    lines.push({ trigger: `2차 목표 ${fmt(tp2)} 도달`, action: "잔량 전량 익절" });
  } else if (tp1 != null) {
    lines.push({ trigger: `목표 ${fmt(tp1)} 도달`, action: "전량 익절" });
  }
  if (bars && bars > 1) {
    lines.push({ trigger: `${bars}거래일 안에 둘 다 안 오면`, action: "그날 종가에 청산" });
  } else if (bars === 1) {
    lines.push({ trigger: "당일 장 마감", action: "종가에 청산" });
  }
  return lines;
}

/** 한 줄 요약 — 카드 헤더처럼 좁은 자리에 쓴다. */
export function holdingSummary(style: string | null | undefined): string {
  const label = holdingLabel(style);
  const approx = holdingApprox(style);
  return approx ? `${label} (${approx})` : label;
}
