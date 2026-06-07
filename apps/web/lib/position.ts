// 포지션 사이징 — 읽기 시점 계산.
//
// 시그널(signals)에는 사용자 무관 값(entry/stop/tp/R:R)만 저장한다. 권장 비중은
// 사용자의 risk_per_trade_pct 에 의존하므로 여기서 계산한다(엔진 levels.py 와 동일 공식):
//   stop_distance_ratio = |entry - stop| / entry
//   position_size_pct   = clamp(risk_per_trade_pct ÷ stop_distance_ratio, 0, MAX)
// → 손절 시 손실이 계좌의 risk_per_trade_pct% 가 되도록 비중 산정.

export const MAX_POSITION_PCT = 25.0;
export const DEFAULT_RISK_PER_TRADE_PCT = 1.0;

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
