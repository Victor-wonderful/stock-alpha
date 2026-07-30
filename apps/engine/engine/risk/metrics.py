"""리스크 지표 계산 — 순수 함수 (DB 없이 테스트 가능).

종목 일별 종가에서 베타·연율변동성·VaR·최대낙폭을 산출. 시장수익률은 유니버스
동일가중 평균(별도 지수 인제스트 없이 단면에서 프록시).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

TRADING_DAYS = 252
_Z95 = 1.645  # 정규 95% 분위 (참고용; var_95 는 역사적 5퍼센타일 사용)


def daily_returns(close: pd.Series) -> pd.Series:
    """종가 시리즈 → 일수익률(결측 제거)."""
    return close.astype(float).pct_change(fill_method=None).dropna()


def market_returns(close_matrix: pd.DataFrame) -> pd.Series:
    """date×instrument 종가 행렬 → 동일가중 시장 일수익률.

    각 종목 일수익률을 구해 날짜별 평균(가용 종목만). 시장 프록시.
    """
    rets = close_matrix.astype(float).pct_change(fill_method=None)
    return rets.mean(axis=1, skipna=True).dropna()


def beta(stock_ret: pd.Series, mkt_ret: pd.Series) -> float | None:
    """공분산/시장분산. 공통 날짜 30개 미만이면 None."""
    j = pd.concat([stock_ret, mkt_ret], axis=1, join="inner").dropna()
    if len(j) < 30:
        return None
    s, m = j.iloc[:, 0], j.iloc[:, 1]
    var_m = float(m.var())
    if var_m <= 0:
        return None
    return round(float(np.cov(s, m)[0, 1] / var_m), 4)


def vol_annual(stock_ret: pd.Series) -> float | None:
    if len(stock_ret) < 20:
        return None
    return round(float(stock_ret.std() * np.sqrt(TRADING_DAYS)), 6)


def var_95(stock_ret: pd.Series) -> float | None:
    """1일 95% VaR — 역사적 5퍼센타일(음수). 표본 부족 시 None."""
    if len(stock_ret) < 20:
        return None
    return round(float(stock_ret.quantile(0.05)), 6)


def max_drawdown(close: pd.Series) -> float | None:
    """기간 최대낙폭(음수). peak 대비 최저."""
    c = close.astype(float).dropna()
    if len(c) < 2:
        return None
    roll_max = c.cummax()
    dd = c / roll_max - 1.0
    return round(float(dd.min()), 6)


def compute_metrics(
    close: pd.Series, mkt_ret: pd.Series,
) -> dict[str, float | None]:
    """단일 종목 종가 + 시장수익률 → 리스크 지표 dict."""
    r = daily_returns(close)
    return {
        "beta": beta(r, mkt_ret),
        "vol_annual": vol_annual(r),
        "var_95": var_95(r),
        "max_drawdown": max_drawdown(close),
    }
