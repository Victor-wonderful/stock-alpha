"""기술적 지표 검증."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from engine.signals import indicators as ind


def _df(close):
    close = pd.Series(close, dtype=float)
    return pd.DataFrame({
        "open": close.shift(1).fillna(close),
        "high": close * 1.01,
        "low": close * 0.99,
        "close": close,
        "volume": pd.Series([1000] * len(close), dtype=float),
    })


def test_sma_ema():
    s = pd.Series([1.0, 2, 3, 4, 5])
    assert ind.sma(s, 2).iloc[-1] == pytest.approx(4.5)
    assert ind.ema(s, 2).iloc[-1] > 0


def test_rsi_uptrend_high():
    s = pd.Series(np.linspace(100, 200, 40))
    assert ind.rsi(s).iloc[-1] > 70


def test_rsi_downtrend_low():
    s = pd.Series(np.linspace(200, 100, 40))
    assert ind.rsi(s).iloc[-1] < 30


def test_atr_positive():
    df = _df(np.linspace(100, 120, 30))
    assert ind.atr(df).iloc[-1] > 0


def test_rolling_high_excludes_current():
    high = pd.Series([10.0, 11, 12, 9, 8])
    rh = ind.rolling_high(high, 3)
    # 마지막 값은 직전 3봉(12,9 포함, 당일 8 제외)의 max
    assert rh.iloc[-1] == 12.0


def test_consecutive_down():
    assert ind.consecutive_down(pd.Series([10.0, 9, 8, 7])) == 3
    assert ind.consecutive_down(pd.Series([10.0, 9, 8, 9])) == 0  # 마지막이 상승
    assert ind.consecutive_down(pd.Series([10.0, 11, 9, 8])) == 2


def test_disparity():
    s = pd.Series([100.0] * 19 + [80.0])
    # 마지막 종가 80, MA20 ≈ 99 → 이격도 < 90
    assert ind.disparity(s, 20).iloc[-1] < 90
