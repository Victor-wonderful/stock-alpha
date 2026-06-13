"""분봉 이벤트 백테스트 — 데이/스캘핑 셋업을 장중 분봉에 재생 (2단계).

일봉 event_backtest 와의 차이:
- **당일 청산 강제**(intraday_only): 거래일 경계로 끊어, 손절/목표 미도달 시 그날 마지막
  봉 종가로 청산(오버나이트 없음). 거래일은 ts 의 날짜로 그룹핑.
- 타임아웃이 '분 단위 봉 수'(timeout_bars).
- 비용은 일봉과 동일 CostModel 차감 → net R.

탐지기 무관(detector callable 주입). 데이/스캘핑 탐지기는 분봉 이력이 축적된 뒤
추가·검증한다(KIS 당일치만 제공 → daily 배치가 매일 상위 유동 200종목 축적 중).

detector(window: pd.DataFrame) -> Candidate|None  (event_backtest 와 동일 계약)
"""
from __future__ import annotations

from typing import Callable

import pandas as pd

from engine.backtest.costs import CostModel
from engine.backtest.metrics import Trade
from engine.signals.levels import compute_levels, min_risk_floor
from engine.signals.styles import TradeStyle


def backtest_intraday(
    df: pd.DataFrame,
    detector: Callable[[pd.DataFrame], object | None],
    *,
    style: TradeStyle = "day",
    risk_per_trade_pct: float = 1.0,
    timeout_bars: int = 30,
    min_lookback: int = 20,
    costs: CostModel | None = None,
) -> list[Trade]:
    """분봉 OHLCV(ts 포함, 다일 가능) → 트레이드 리스트. 당일 청산 강제.

    df: open/high/low/close/volume/ts (시간 오름차순). ts 의 날짜로 거래일 분리.
    detector: 분봉 윈도 → 매수 후보(Candidate-유사: side·style·entry_ref·atr·support).
    timeout_bars: 진입 후 최대 보유 분봉 수(당일 마지막 봉으로도 상한).
    """
    if costs is None:
        costs = CostModel()
    if df.empty or "ts" not in df.columns:
        return []

    work = df.reset_index(drop=True)
    day = work["ts"].astype(str).str.slice(0, 10)
    trades: list[Trade] = []

    for _day, idx in day.groupby(day).groups.items():
        d = work.loc[idx].reset_index(drop=True)
        n = len(d)
        if n < min_lookback + 2:
            continue
        i = min_lookback
        while i < n - 1:
            cand = detector(d.iloc[: i + 1])
            if cand is None or getattr(cand, "side", None) != "buy":
                i += 1
                continue
            lv = compute_levels(
                style=style, side="buy", entry_price=cand.entry_ref,
                atr=cand.atr, risk_per_trade_pct=risk_per_trade_pct,
                support=getattr(cand, "support", None),
                resistance=getattr(cand, "resistance", None),
            )
            entry, stop, tp = lv.entry_price, lv.stop_loss, lv.tp1
            risk = entry - stop
            if risk <= 0 or risk < min_risk_floor(entry, cand.atr):
                i += 1
                continue

            # 당일 마지막 봉(n-1)으로 보유 상한 — 오버나이트 없음.
            exit_idx = min(i + timeout_bars, n - 1)
            exit_price = None
            for j in range(i + 1, exit_idx + 1):
                lo = float(d["low"].iloc[j])
                hi = float(d["high"].iloc[j])
                if lo <= stop:                 # 손절 우선(보수적)
                    exit_price = stop
                    exit_idx = j
                    break
                if hi >= tp:
                    exit_price = tp
                    exit_idx = j
                    break
            if exit_price is None:             # 타임아웃/EOD → 종가 청산
                exit_price = float(d["close"].iloc[exit_idx])

            pnl = costs.net_pnl(entry, exit_price)
            trades.append(Trade(
                r_multiple=pnl / risk,
                ret_pct=(pnl / entry) * (lv.position_size_pct / 100.0),
                bars_held=exit_idx - i,
                entry_ts=str(d["ts"].iloc[i]),
                r_gross=(exit_price - entry) / risk,
            ))
            i = exit_idx + 1

    return trades
