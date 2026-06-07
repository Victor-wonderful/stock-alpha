"""기술적 지표 — 순수 pandas 구현 (외부 의존성 없이 테스트 가능).

입력 OHLCV DataFrame 컬럼: open, high, low, close, volume (시간 오름차순).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=1).mean()


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    """Wilder RSI."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / n, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / n, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    return out.fillna(100.0)  # loss 0 → 강한 상승 → RSI 100


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Average True Range."""
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def rolling_high(high: pd.Series, n: int) -> pd.Series:
    """직전 n봉 최고가(당일 제외)."""
    return high.shift(1).rolling(n, min_periods=1).max()


def rolling_low(low: pd.Series, n: int) -> pd.Series:
    return low.shift(1).rolling(n, min_periods=1).min()


def disparity(close: pd.Series, n: int = 20) -> pd.Series:
    """이격도(%) = close / SMA(n) * 100."""
    return close / sma(close, n) * 100.0


def consecutive_down(close: pd.Series) -> int:
    """현재 시점까지 연속 음봉(전일 대비 하락) 개수."""
    diff = close.diff()
    cnt = 0
    for v in reversed(diff.tolist()):
        if pd.isna(v):
            break
        if v < 0:
            cnt += 1
        else:
            break
    return cnt
