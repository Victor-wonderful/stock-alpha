"""이벤트 기반 백테스트 — 플레이북을 과거에 재생하여 트레이드 결과 산출.

방식: 각 봉에서 detector(df[:i+1]) 트리거 시 levels 로 진입/손절/tp1 산출 →
이후 봉을 따라가며 손절/목표/타임아웃 중 먼저 닿는 곳에서 청산.
보수적 가정: 한 봉에서 손절·목표가 동시 도달 시 손절 우선.
포지션은 한 번에 하나(중첩 진입 없음).
"""
from __future__ import annotations

import pandas as pd

from engine.backtest.costs import CostModel
from engine.backtest.metrics import Trade
from engine.signals import playbooks
from engine.signals.levels import compute_levels, min_risk_floor
from engine.signals.styles import TradeStyle

# 스타일별 타임아웃(일봉 기준 보유 봉 수)
_TIMEOUT_BARS: dict[TradeStyle, int] = {
    "scalping": 1, "day": 1, "swing": 10, "position": 60,
}


def backtest_playbook(
    df: pd.DataFrame,
    setup: str,
    *,
    risk_per_trade_pct: float = 1.0,
    min_lookback: int = 60,
    flows: pd.DataFrame | None = None,
    earnings: pd.DataFrame | None = None,
    costs: CostModel | None = None,
) -> list[Trade]:
    """단일 종목·단일 플레이북 백테스트 → 트레이드 리스트.

    flows: 수급 셋업용 [date, foreign_net, inst_net] 오름차순 — 각 봉 시점까지로
    슬라이스해 전달(point-in-time). df 에 ts 컬럼이 없으면 전체를 그대로 전달.
    earnings: PEAD 용 [date, surprise] 오름차순 — detect_pead 가 봉의 ts 로
    직접 point-in-time 슬라이스하므로 전체를 그대로 전달.
    costs: 거래비용 모델(수수료·거래세·슬리피지). None 이면 한국 현물 기본값 적용.
    R·수익률은 비용 차감 후(net)로 산출 — gross 가 필요하면 costs=ZERO_COST.
    """
    if costs is None:
        costs = CostModel()
    detector = playbooks.ALL_DETECTORS.get(setup)
    if detector is None or len(df) < min_lookback + 2:
        return []
    needs_flows = setup == "flow_accumulation"
    if needs_flows and (flows is None or flows.empty):
        return []
    needs_earnings = setup == "pead"
    if needs_earnings and (earnings is None or earnings.empty):
        return []

    trades: list[Trade] = []
    i = min_lookback
    n = len(df)
    while i < n - 1:
        window = df.iloc[: i + 1]
        if needs_flows:
            if "ts" in df.columns:
                now_ts = str(df["ts"].iloc[i])[:10]
                fwin = flows[flows["date"] <= now_ts]
            else:
                fwin = flows
            cand = detector(window, flows=fwin)
        elif needs_earnings:
            cand = detector(window, earnings=earnings)
        else:
            cand = detector(window)
        if cand is None or cand.side != "buy":  # 현재 플레이북은 모두 매수
            i += 1
            continue

        lv = compute_levels(
            style=cand.style, side="buy", entry_price=cand.entry_ref,
            atr=cand.atr, risk_per_trade_pct=risk_per_trade_pct,
            support=cand.support, resistance=cand.resistance,
        )
        entry = lv.entry_price
        stop = lv.stop_loss
        tp = lv.tp1
        risk = entry - stop
        # 노이즈 수준 손절폭 배제 — 라이브 시그널(generate)과 동일 기준(levels).
        if risk <= 0 or risk < min_risk_floor(entry, cand.atr):
            i += 1
            continue

        timeout = _TIMEOUT_BARS.get(cand.style, 10)
        exit_price = None
        exit_idx = min(i + timeout, n - 1)
        for j in range(i + 1, exit_idx + 1):
            lo = float(df["low"].iloc[j])
            hi = float(df["high"].iloc[j])
            if lo <= stop:                 # 손절 우선(보수적)
                exit_price = stop
                exit_idx = j
                break
            if hi >= tp:
                exit_price = tp
                exit_idx = j
                break
        if exit_price is None:             # 타임아웃 → 종가 청산
            exit_price = float(df["close"].iloc[exit_idx])

        # 순손익(비용 차감) — 수수료·거래세·슬리피지 반영. 리스크는 계획값(entry-stop)
        # 유지 → '계획 리스크 대비 실현 순R'.
        pnl = costs.net_pnl(entry, exit_price)
        r_multiple = pnl / risk
        r_gross = (exit_price - entry) / risk      # 비용 미반영 — 진단용
        ret_pct = (pnl / entry) * (lv.position_size_pct / 100.0)
        entry_ts = str(df["ts"].iloc[i]) if "ts" in df.columns else ""
        trades.append(Trade(
            r_multiple=r_multiple, ret_pct=ret_pct, bars_held=exit_idx - i,
            entry_ts=entry_ts, r_gross=r_gross,
        ))
        i = exit_idx + 1                   # 청산 다음 봉부터 재탐색(중첩 방지)

    return trades
