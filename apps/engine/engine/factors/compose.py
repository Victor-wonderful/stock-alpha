"""팩터 합성 — 섹터 중립 z-score → 가중 합성 composite_alpha."""
from __future__ import annotations

import pandas as pd

from engine.factors.factors import RAW_FACTORS
from engine.factors.normalize import sector_neutral_zscore, zscore

# 기본 팩터 가중치 (합 = 1). 매크로 레짐에 따라 M4 후속에서 동적 조정.
DEFAULT_WEIGHTS: dict[str, float] = {
    "value": 0.25,
    "quality": 0.20,
    "momentum": 0.20,
    "growth": 0.15,
    "lowvol": 0.10,
    "size": 0.10,
}


def zscore_factors(raw: pd.DataFrame, sectors: pd.Series | None = None) -> pd.DataFrame:
    """raw 팩터 → (섹터 중립) z-score. 섹터 정보 없으면 전체 z-score."""
    z = pd.DataFrame(index=raw.index)
    for f in RAW_FACTORS:
        if f not in raw:
            continue
        if sectors is not None:
            tmp = pd.DataFrame({"v": raw[f], "sector": sectors.values}, index=raw.index)
            z[f + "_z"] = sector_neutral_zscore(tmp, "v", "sector")
        else:
            z[f + "_z"] = zscore(raw[f].dropna()).reindex(raw.index)
    return z


def composite_alpha(z: pd.DataFrame, weights: dict[str, float] | None = None) -> pd.Series:
    """가중 합성 알파. 결측 팩터는 가중치 재정규화로 처리."""
    w = weights or DEFAULT_WEIGHTS
    cols = [(f + "_z", w[f]) for f in w if (f + "_z") in z]
    if not cols:
        return pd.Series(0.0, index=z.index)

    total = pd.Series(0.0, index=z.index)
    wsum = pd.Series(0.0, index=z.index)
    for col, weight in cols:
        vals = z[col]
        mask = vals.notna()
        total = total.add((vals.fillna(0) * weight).where(mask, 0.0), fill_value=0.0)
        wsum = wsum.add(pd.Series(weight, index=z.index).where(mask, 0.0), fill_value=0.0)

    return (total / wsum.replace(0, pd.NA)).astype(float)
