"""기술적 지표 — 순수 pandas 구현 (외부 의존성 없이 테스트 가능).

입력 OHLCV DataFrame 컬럼: open, high, low, close, volume (시간 오름차순).
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def clean_halt_bars(df: pd.DataFrame) -> pd.DataFrame:
    """거래정지일 봉(시가·고가·저가 0, 종가만 있음)을 «그날 가격 = 종가»로 채운다.

    수집원은 거래가 없던 날을 시가·고가·저가 0 · 종가 = 직전 종가로 내려준다.
    그대로 두면 그날 하루 움직임(TR)이 «종가 전액»으로 잡힌다 — 2026-07~08 한화가
    3주 정지되며 TR 83,800 이 13번 찍혔고, ATR 이 실제(약 7,000)의 2.4배로 부풀어
    9/28 픽 손절이 -23% 로 나갔다(정상이면 약 -10%). 지수평활이라 정지가 풀린 뒤에도
    두 달 가까이 남는다. 저가 0 은 지지선·손절 터치 판정도 망가뜨린다.

    거래가 없던 날은 «가격이 종가에 멈춰 있었다»가 사실이므로 O=H=L=C 로 채운다.
    이러면 TR 은 직전 종가와의 차이(대개 0)가 되고, 손절 판정에도 걸리지 않는다.
    """
    if df.empty or not {"open", "high", "low", "close"} <= set(df.columns):
        return df
    bad = (df["close"] > 0) & (
        (df["open"] <= 0) | (df["high"] <= 0) | (df["low"] <= 0)
    )
    if not bad.any():
        return df
    out = df.copy()
    for col in ("open", "high", "low"):
        out.loc[bad, col] = out.loc[bad, "close"]
    return out


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
    """Average True Range. 거래정지 봉은 clean_halt_bars 로 먼저 채운다(로더를 안 거친 입력 대비)."""
    df = clean_halt_bars(df)
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


def rolling_std(s: pd.Series, n: int = 20) -> pd.Series:
    """이동 표준편차 — 시그마(σ) 밴드용."""
    return s.rolling(n, min_periods=max(2, n // 2)).std()


def kalman(s: pd.Series, q_ratio: float = 2e-3, r_ratio: float = 6e-2) -> pd.Series:
    """스칼라 칼만필터 — 가격의 동적 추세 수준 추정(랜덤워크 모델).

    EMA 보다 지연이 적고 노이즈에 강한 적응형 평활. 프로세스/측정 잡음을 현재
    추정치 수준에 비례(상대분산)시켜 가격 스케일에 무관하게 동작한다.
    q_ratio↑ = 더 민감(추세 추종), r_ratio↑ = 더 평활(노이즈 억제).
    """
    vals = s.to_numpy(dtype=float)
    if len(vals) == 0:
        return pd.Series([], dtype=float, index=s.index)
    x = float(vals[0])
    p = 1.0
    out = np.empty_like(vals)
    for i, z in enumerate(vals):
        q = (q_ratio * x) ** 2
        r = (r_ratio * x) ** 2
        p += q                       # 예측: 불확실성 증가
        kg = p / (p + r)             # 칼만 이득
        x += kg * (float(z) - x)     # 갱신: 측정 반영
        p = (1.0 - kg) * p
        out[i] = x
    return pd.Series(out, index=s.index)


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
