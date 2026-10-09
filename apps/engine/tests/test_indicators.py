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


# ── 거래정지 봉(시가·고가·저가 0) — 2026-09-28 한화 손절 -23% 사고 ──

def _halt_df():
    # 정상 5봉(하루 움직임 2) → 정지 3봉(O/H/L=0, 종가만) → 정상 5봉
    rows = [(100, 101, 99, 100)] * 5 + [(0, 0, 0, 100)] * 3 + [(100, 101, 99, 100)] * 5
    return pd.DataFrame(rows, columns=["open", "high", "low", "close"], dtype=float)


def test_clean_halt_bars_fills_with_close():
    out = ind.clean_halt_bars(_halt_df())
    halt = out.iloc[5:8]
    assert (halt[["open", "high", "low"]].to_numpy() == 100.0).all()
    assert (out["low"] > 0).all()


def test_atr_ignores_halt_bars():
    """정지 봉의 TR 이 «종가 전액»으로 잡혀 ATR 이 수십 배로 부풀면 안 된다."""
    a = float(ind.atr(_halt_df(), n=3).iloc[-1])
    assert a <= 2.0 + 1e-9          # 고치기 전: 정지 봉 TR=100 → ATR ≈ 8 이상


def test_clean_halt_bars_leaves_normal_and_zero_close_rows():
    df = pd.DataFrame([(100, 101, 99, 100), (0, 0, 0, 0)],
                      columns=["open", "high", "low", "close"], dtype=float)
    out = ind.clean_halt_bars(df)
    assert out.iloc[0].tolist() == [100, 101, 99, 100]
    assert out.iloc[1].tolist() == [0, 0, 0, 0]   # 종가도 없으면 채울 근거가 없다
