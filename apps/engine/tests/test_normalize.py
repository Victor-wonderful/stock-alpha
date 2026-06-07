"""팩터 정규화 검증."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.factors.normalize import sector_neutral_zscore, zscore


def test_zscore_mean_zero_std_one():
    s = pd.Series([1.0, 2, 3, 4, 5])
    z = zscore(s)
    assert np.isclose(z.mean(), 0.0)  # 평균 ~0
    assert np.isclose(z.std(ddof=0), 1.0)


def test_zscore_constant_series_returns_zero():
    s = pd.Series([5.0, 5, 5])
    assert (zscore(s) == 0).all()


def test_sector_neutral_isolates_sectors():
    df = pd.DataFrame({
        "v": [1.0, 2, 3, 100, 200, 300],
        "sector": ["A", "A", "A", "B", "B", "B"],
    })
    z = sector_neutral_zscore(df, "v", "sector")
    # 각 섹터 내부 z-score 는 동일 패턴 (중앙값이 0 근처)
    a = z[df.sector == "A"].to_numpy()
    b = z[df.sector == "B"].to_numpy()
    assert np.allclose(a, b)  # 두 섹터 모두 [-1.22, 0, 1.22] 형태
