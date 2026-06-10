"""유동성 필터 테스트 — 시그널/백테스트 유니버스 하한."""
from __future__ import annotations

import pandas as pd

from engine.liquidity import (
    SIGNAL_TURNOVER_FLOOR_KRW,
    df_avg_turnover_krw,
    filter_liquid_frames,
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
