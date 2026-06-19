"""팩터 합성 — 섹터 중립 z-score → 가중 합성 composite_alpha."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.factors.factors import RAW_FACTORS
from engine.factors.normalize import sector_neutral_zscore, zscore

# 기본 팩터 가중치 (합 = 1).
# 2026-06-14 IC 감사(scripts/diag_factor_ic, point-in-time 39주) 기반 재가중:
#   value·quality 가 유일하게 롱사이드 초과수익 양수(상위10% t≈1.7) → 핵심.
#   momentum 약양수(t≈1.1) 보조. lowvol 은 rank IC 는 높으나 강세장에서 롱사이드
#   초과수익 음수(t=-0.6) → 제거. size 는 미검증 → 제거. growth 는 유망(IC>0 91%)
#   하나 표본 부족(n=11, 2025FY 공시 이후만) → 공시일 백필로 표본 확보 후 재편입.
#   검증된 최적 합성 VQM(value.4/quality.4/momentum.2): 상위10% 초과 t 1.43→1.68.
DEFAULT_WEIGHTS: dict[str, float] = {
    "value": 0.40,
    "quality": 0.40,
    "momentum": 0.20,
}

# 레짐별 팩터 틸트 (PLAN: "국면 분류 → 팩터 가중 조정").
# 검증된 VQM 집합 안에서만 재분배한다 — IC 감사에서 탈락한 lowvol/size/growth 를
# 레짐 핑계로 다시 들이지 않는다. 금융 이론: 위험선호 국면은 추세(momentum)가,
# 위험회피 국면은 방어적 가치·품질이 상대우위. 틸트는 보수적(momentum 0.10~0.40)
# 으로, value·quality 핵심 우위를 뒤집지 않는 범위. neutral·미상 레짐은 기본 가중.
REGIME_TILT: dict[str, dict[str, float]] = {
    "risk_on":  {"value": 0.30, "quality": 0.30, "momentum": 0.40},
    "risk_off": {"value": 0.45, "quality": 0.45, "momentum": 0.10},
}


def regime_weights(regime: str | None) -> dict[str, float]:
    """레짐 → 팩터 가중치. risk_on=모멘텀 가산·risk_off=가치/품질 가산, 그 외 기본.

    반환은 항상 합 1.0 (테이블·DEFAULT_WEIGHTS 모두 정규화 상태).
    """
    return dict(REGIME_TILT.get(regime or "", DEFAULT_WEIGHTS))


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

    # 팩터가 전무한 종목은 wsum=0 → NaN. pd.NA 를 쓰면 object dtype 이 되어
    # astype(float) 가 NAType 에서 죽는다(잠복 버그, 2026-06-11 표면화).
    return (total / wsum.replace(0, np.nan)).astype(float)
