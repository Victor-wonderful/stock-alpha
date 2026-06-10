"""유동성 필터 — 시그널/백테스트 유니버스와 리포트 거래가능 기준의 단일 출처.

진단(2026-06-10, scripts/diag_playbook_breakdown.py, 397종목 표본):
플레이북 기대값이 20일 평균 거래대금 구간에 따라 극명하게 갈린다 —
10억+ 에서 leader_trend +0.119R · breakout +0.080R · close_betting +0.051R(통과),
1~10억은 혼조~음수, 1억 미만은 전부 큰 음수(breakout -0.91R).
→ 시그널·백테스트는 10억+ 만 대상. 리포트의 '거래 가능' 최소선은 1억(완화).
"""
from __future__ import annotations

import pandas as pd

SIGNAL_TURNOVER_FLOOR_KRW = 1_000_000_000  # 시그널/백테스트 유니버스 하한(10억)
REPORT_TURNOVER_FLOOR_KRW = 100_000_000    # 리포트 거래가능 게이트 하한(1억)


def df_avg_turnover_krw(df: pd.DataFrame, window: int = 20) -> float | None:
    """OHLCV DataFrame(close·volume) → 최근 window 일 평균 거래대금."""
    if df.empty or "close" not in df or "volume" not in df:
        return None
    t = (df["close"] * df["volume"]).tail(window)
    return float(t.mean()) if len(t) else None


def filter_liquid_frames(
    frames: dict[int, pd.DataFrame],
    floor_krw: float = SIGNAL_TURNOVER_FLOOR_KRW,
) -> dict[int, pd.DataFrame]:
    """{instrument_id: ohlcv} → 평균 거래대금이 하한 이상인 종목만."""
    return {
        iid: df
        for iid, df in frames.items()
        if (df_avg_turnover_krw(df) or 0.0) >= floor_krw
    }
