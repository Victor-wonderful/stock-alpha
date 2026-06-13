"""유동성 필터 테스트 — 시그널/백테스트 유니버스 하한."""
from __future__ import annotations

import pandas as pd

from engine.liquidity import (
    SIGNAL_TURNOVER_FLOOR_KRW,
    df_avg_turnover_krw,
    filter_liquid_frames,
    rank_instruments_by_turnover,
)


def _df(close: float, volume: float, n: int = 30) -> pd.DataFrame:
    return pd.DataFrame({
        "open": [close] * n, "high": [close] * n, "low": [close] * n,
        "close": [close] * n, "volume": [volume] * n,
    })


def test_avg_turnover():
    df = _df(close=10_000, volume=200_000)  # 20억/일
    assert df_avg_turnover_krw(df) == 10_000 * 200_000
    assert df_avg_turnover_krw(pd.DataFrame()) is None


def test_filter_liquid_frames():
    frames = {
        1: _df(10_000, 200_000),   # 20억 — 통과
        2: _df(1_000, 50_000),     # 5천만 — 탈락
        3: _df(50_000, 20_000),    # 10억 — 경계 통과
    }
    out = filter_liquid_frames(frames, SIGNAL_TURNOVER_FLOOR_KRW)
    assert set(out) == {1, 3}


def test_rank_by_turnover_orders_by_avg_amount():
    rows = [
        {"instrument_id": 1, "close": 100.0, "volume": 10},   # 1,000
        {"instrument_id": 1, "close": 100.0, "volume": 30},   # 3,000 → 평균 2,000
        {"instrument_id": 2, "close": 50.0, "volume": 200},   # 10,000
        {"instrument_id": 3, "close": 10.0, "volume": 10},    # 100
    ]
    assert rank_instruments_by_turnover(rows, n=2) == [2, 1]
    assert rank_instruments_by_turnover(rows, n=10) == [2, 1, 3]


def test_rank_handles_nones_and_empty():
    assert rank_instruments_by_turnover([], n=5) == []
    rows = [
        {"instrument_id": None, "close": 1, "volume": 1},
        {"instrument_id": 7, "close": None, "volume": None},
    ]
    assert rank_instruments_by_turnover(rows, n=5) == [7]
