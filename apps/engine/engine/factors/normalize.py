"""팩터 정규화 유틸 — 섹터 중립 z-score (M4 의 기반).

순수 함수라 데이터 없이도 테스트 가능.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def winsorize(s: pd.Series, lower: float = 0.01, upper: float = 0.99) -> pd.Series:
    """이상치 절단."""
    lo, hi = s.quantile(lower), s.quantile(upper)
    return s.clip(lower=lo, upper=hi)


def zscore(s: pd.Series) -> pd.Series:
    """표준 z-score. 표준편차 0이면 0 반환."""
    std = s.std(ddof=0)
    if std == 0 or np.isnan(std):
        return pd.Series(0.0, index=s.index)
    return (s - s.mean()) / std


def sector_neutral_zscore(df: pd.DataFrame, value_col: str, sector_col: str) -> pd.Series:
    """섹터 내에서 winsorize 후 z-score → 섹터 중립 팩터 점수."""
    def _per_sector(g: pd.Series) -> pd.Series:
        return zscore(winsorize(g))

    return (
        df.groupby(sector_col)[value_col]
        .transform(lambda g: _per_sector(g))
    )
