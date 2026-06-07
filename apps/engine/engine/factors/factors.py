"""팩터 원시 지표 산출 — 종목별 raw 팩터 값.

입력: 종목 단면(cross-section) DataFrame. 한 행 = 한 종목.
필요 컬럼(없으면 NaN 허용):
  net_income, equity, debt, revenue, fcf, eps, bps, price, shares,
  ret_12_1(12-1개월 수익률), rev_growth, eps_growth, volatility, market_cap

출력: 동일 인덱스의 raw 팩터 DataFrame (value/quality/momentum/growth/lowvol/size).
방향성: 값이 클수록 '좋은(매수) 신호'가 되도록 부호를 맞춘다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

RAW_FACTORS = ["value", "quality", "momentum", "growth", "lowvol", "size"]


def _safe(series: pd.Series) -> pd.Series:
    return series.replace([np.inf, -np.inf], np.nan)


def compute_raw_factors(df: pd.DataFrame) -> pd.DataFrame:
    """단면 DataFrame → raw 팩터 DataFrame."""
    out = pd.DataFrame(index=df.index)

    # Value: 이익수익률(1/PER) + 장부수익률(1/PBR) + FCF yield. 높을수록 저평가=좋음
    earnings_yield = _safe(df.get("eps") / df.get("price"))
    book_yield = _safe(df.get("bps") / df.get("price"))
    mcap = df.get("market_cap")
    fcf_yield = _safe(df.get("fcf") / mcap) if mcap is not None else np.nan
    out["value"] = pd.concat([earnings_yield, book_yield, fcf_yield], axis=1).mean(axis=1)

    # Quality: ROE - 부채비율 패널티. 높을수록 우량
    roe = _safe(df.get("net_income") / df.get("equity"))
    debt_ratio = _safe(df.get("debt") / df.get("equity"))
    out["quality"] = roe - 0.1 * debt_ratio.fillna(0)

    # Momentum: 12-1개월 수익률. 높을수록 강세
    out["momentum"] = _safe(df.get("ret_12_1")) if "ret_12_1" in df else np.nan

    # Growth: 매출·EPS 성장 평균
    rg = _safe(df.get("rev_growth")) if "rev_growth" in df else np.nan
    eg = _safe(df.get("eps_growth")) if "eps_growth" in df else np.nan
    out["growth"] = pd.concat([pd.Series(rg, index=df.index), pd.Series(eg, index=df.index)], axis=1).mean(axis=1)

    # LowVol: 변동성의 음수. 변동성 낮을수록 좋음
    out["lowvol"] = -_safe(df.get("volatility")) if "volatility" in df else np.nan

    # Size: 시총의 음의 로그. 소형주일수록 높음(사이즈 프리미엄)
    if mcap is not None:
        out["size"] = -np.log(_safe(mcap.where(mcap > 0)))
    else:
        out["size"] = np.nan

    return out
