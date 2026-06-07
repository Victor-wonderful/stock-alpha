"""멀티팩터 종합 시그널 생성 검증 (네트워크 없음)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.signals.factor_signals import generate_factor_signals


def _frame(base: float) -> pd.DataFrame:
    n = 60
    close = pd.Series(np.linspace(base, base * 1.2, n))
    return pd.DataFrame({
        "open": close, "high": close * 1.01, "low": close * 0.99,
        "close": close, "volume": pd.Series([1000.0] * n),
    })


def _scores() -> list[dict]:
    return [
        {"instrument_id": 1, "composite_alpha": 0.9, "sector_rank": 1},
        {"instrument_id": 2, "composite_alpha": 0.5, "sector_rank": 2},
        {"instrument_id": 3, "composite_alpha": -0.3, "sector_rank": 9},
        {"instrument_id": 4, "composite_alpha": None},   # 결측 제외
    ]


def test_generates_top_alpha_buy_signals():
    frames = {1: _frame(100), 2: _frame(200), 3: _frame(300)}
    rows = generate_factor_signals(_scores(), frames, top_pct=0.7)  # 상위 70% → 2종목
    iids = {r["instrument_id"] for r in rows}
    assert iids == {1, 2}                       # alpha 상위 2 (3은 음수 컷, 4는 결측)
    r1 = next(r for r in rows if r["instrument_id"] == 1)
    assert r1["setup"] == "factor_composite"
    assert r1["signal_type"] == "buy"
    assert r1["entry_price"] > 0
    assert r1["stop_loss"] < r1["entry_price"] < r1["tp1"]
    assert r1["factor_payload"]["composite_alpha"] == 0.9


def test_strength_orders_by_alpha():
    frames = {1: _frame(100), 2: _frame(200)}
    rows = generate_factor_signals(_scores(), frames, top_pct=1.0, min_alpha=-1.0)
    by_iid = {r["instrument_id"]: r["strength"] for r in rows}
    assert by_iid[1] > by_iid[2]                # 합성알파 높을수록 강도 큼


def test_min_alpha_filter():
    frames = {1: _frame(100), 2: _frame(200), 3: _frame(300)}
    rows = generate_factor_signals(_scores(), frames, top_pct=1.0, min_alpha=0.0)
    assert {r["instrument_id"] for r in rows} == {1, 2}   # 음수 alpha 제외


def test_empty_scores():
    assert generate_factor_signals([], {1: _frame(100)}) == []
