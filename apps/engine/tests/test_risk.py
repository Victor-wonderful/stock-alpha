"""리스크 지표 순수함수 검증 (네트워크 없음)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.risk import metrics as M


def test_daily_returns():
    r = M.daily_returns(pd.Series([100.0, 110.0, 99.0]))
    assert len(r) == 2
    assert abs(r.iloc[0] - 0.1) < 1e-9
    assert abs(r.iloc[1] - (-0.1)) < 1e-9


def test_max_drawdown():
    # 100 → 120(peak) → 90 : MDD = 90/120 - 1 = -0.25
    mdd = M.max_drawdown(pd.Series([100, 110, 120, 100, 90]))
    assert abs(mdd - (-0.25)) < 1e-9


def test_vol_annual():
    rng = np.random.default_rng(0)
    r = pd.Series(rng.normal(0, 0.01, 300))
    v = M.vol_annual(r)
    # 일변동성 ~0.01 → 연율 ~0.01*sqrt(252) ≈ 0.1587
    assert 0.12 < v < 0.20


def test_var_95_negative():
    rng = np.random.default_rng(1)
    r = pd.Series(rng.normal(0, 0.02, 500))
    v = M.var_95(r)
    assert v is not None and v < 0  # 5퍼센타일은 음수


def test_beta_self_is_one():
    rng = np.random.default_rng(2)
    mkt = pd.Series(rng.normal(0, 0.01, 200))
    # 종목수익 = 2×시장 → 베타 ≈ 2
    stock = mkt * 2.0
    b = M.beta(stock, mkt)
    assert abs(b - 2.0) < 1e-6


def test_beta_insufficient():
    s = pd.Series([0.01, -0.01, 0.02])
    assert M.beta(s, s) is None  # 30 미만


def test_market_returns():
    mat = pd.DataFrame({
        1: [100.0, 110.0, 121.0],   # +10%, +10%
        2: [50.0, 55.0, 60.5],      # +10%, +10%
    })
    mr = M.market_returns(mat)
    assert len(mr) == 2
    assert abs(mr.iloc[0] - 0.1) < 1e-9


def test_compute_metrics_keys():
    rng = np.random.default_rng(3)
    close = pd.Series(100 * np.cumprod(1 + rng.normal(0, 0.01, 120)))
    mkt = M.daily_returns(close) * 0.9
    m = M.compute_metrics(close, mkt)
    assert set(m) == {"beta", "vol_annual", "var_95", "max_drawdown"}
    assert m["vol_annual"] is not None
