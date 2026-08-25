// 포지션 사이징 — 읽기 시점 계산.
//
// 시그널(signals)에는 사용자 무관 값(entry/stop/tp/R:R)만 저장한다. 권장 비중은
// 사용자의 risk_per_trade_pct 에 의존하므로 여기서 계산한다(엔진 levels.py 와 동일 공식):
//   stop_distance_ratio = |entry - stop| / entry
//   position_size_pct   = clamp(risk_per_trade_pct ÷ stop_distance_ratio, 0, MAX)
// → 손절 시 손실이 계좌의 risk_per_trade_pct% 가 되도록 비중 산정.

// 25 → 15 (2026-08-25). 엔진 signals/levels.py MAX_POSITION_PCT 와 **같은 값**이어야
// 한다(화면과 발행이 같은 말을 하려면). 25% 일 때 손절폭 4% 미만 픽이 전부 25% 로
// 묶여, 리스크는 1% 미만인데 노출만 25% 를 먹었다 — 8월 픽 36건 중 33% 가 그랬고
// 포트폴리오는 6.5종목에서 노출 100% 로 포화했다.
export const MAX_POSITION_PCT = 15.0;
export const DEFAULT_RISK_PER_TRADE_PCT = 1.0;

/** 이 픽이 손절될 때 계좌가 잃는 비율(%) — 엔진 daily.account_risk_pct 와 같은 공식.
 *
 * 비중이 상한에 걸리면 실제 리스크는 riskPerTradePct 보다 **작아진다**. 종목수 ×
 * riskPerTradePct 로 세면 총 리스크를 과대평가한다 — 그래서 비중에서 되짚는다. */
export function computeAccountRiskPct(
  entry: number | null | undefined,
  stop: number | null | undefined,
  riskPerTradePct: number = DEFAULT_RISK_PER_TRADE_PCT,
): number | null {
  if (entry == null || stop == null || entry <= 0) return null;
  const sizePct = computePositionSizePct(entry, stop, riskPerTradePct);
  if (sizePct == null) return null;
  const stopDistanceRatio = Math.abs(entry - stop) / entry;
  return Math.round(sizePct * stopDistanceRatio * 1000) / 1000;
}

export function computePositionSizePct(
  entry: number | null | undefined,
  stop: number | null | undefined,
  riskPerTradePct: number = DEFAULT_RISK_PER_TRADE_PCT,
): number | null {
  if (entry == null || stop == null || entry <= 0) return null;
  const stopDistanceRatio = Math.abs(entry - stop) / entry;
  if (stopDistanceRatio <= 0) return null;
  const raw = riskPerTradePct / stopDistanceRatio;
  const clamped = Math.max(0, Math.min(raw, MAX_POSITION_PCT));
  return Math.round(clamped * 100) / 100;
}
