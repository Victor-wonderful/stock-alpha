"""분봉 이벤트 백테스트 엔진 검증 — 합성 분봉 (네트워크 없음).

데이/스캘핑 탐지기는 분봉 이력 축적 후 추가하므로, 여기선 엔진 계약을
간단한 모멘텀 탐지기로 검증한다(당일청산·비용차감·거래일 분리).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.backtest.costs import ZERO_COST
from engine.backtest.intraday_backtest import backtest_intraday
from engine.signals.playbooks import Candidate


def _mom_detector(window: pd.DataFrame):
    """직전 20봉 고점을 종가가 상향 돌파하면 매수(테스트용)."""
    if len(window) < 21:
        return None
    closes = window["close"]
    c = float(closes.iloc[-1])
    prior_max = float(closes.iloc[:-1].tail(20).max())
    if c <= prior_max:
        return None
    rng = float((window["high"] - window["low"]).tail(20).mean())
    atr = rng if rng > 0 else c * 0.005
    return Candidate(
        setup="breakout", side="buy", style="day", session="regular",
        entry_ref=c, atr=atr, strength=0.6, rationale=["test"],
    )


def _two_day_minutes() -> pd.DataFrame:
    """2거래일치 분봉 — 각 날 횡보 후 상승 돌파."""
    rows = []
    for day in ("2026-06-10", "2026-06-11"):
        base = np.concatenate([np.full(25, 100.0), np.linspace(100.0, 108.0, 35)])
        for k, c in enumerate(base):
            hh = c * 1.002
            ll = c * 0.998
            t = f"{day}T{9 + k // 60:02d}:{k % 60:02d}:00+09:00"
            rows.append({"open": c, "high": hh, "low": ll, "close": c,
                         "volume": 1000.0, "ts": t})
    return pd.DataFrame(rows)


def test_intraday_produces_trades_and_is_daily_closed():
    df = _two_day_minutes()
    trades = backtest_intraday(df, _mom_detector, style="day",
                               timeout_bars=30, min_lookback=20)
    assert trades, "돌파 구간에서 트레이드가 나와야 함"
    # 진입 시점은 두 거래일 중 하나
    days = {t.entry_ts[:10] for t in trades}
    assert days <= {"2026-06-10", "2026-06-11"}
    # 보유 봉 수는 당일 범위 내(60봉/일 미만)
    assert all(t.bars_held < 60 for t in trades)


def test_intraday_costs_reduce_r():
    df = _two_day_minutes()
    net = backtest_intraday(df, _mom_detector, timeout_bars=30, min_lookback=20)
    gross = backtest_intraday(df, _mom_detector, timeout_bars=30,
                              min_lookback=20, costs=ZERO_COST)
    if net and gross:
        assert sum(t.r_multiple for t in net) <= sum(t.r_multiple for t in gross)


def test_intraday_empty_without_ts():
    assert backtest_intraday(pd.DataFrame({"close": [1, 2]}), _mom_detector) == []
