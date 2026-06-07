"""멀티팩터 엔진 검증 — raw 팩터·z-score·합성 알파·랭크 (네트워크 없음)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.factors.compose import composite_alpha, zscore_factors
from engine.factors.factors import compute_raw_factors
from engine.factors.runner import build_factor_scores


def _cross():
    # 4개 종목, 2개 섹터
    return pd.DataFrame(
        {
            "sector": ["A", "A", "B", "B"],
            "net_income": [150, 50, 300, 100],
            "equity": [1000, 1000, 1000, 1000],
            "debt": [200, 800, 100, 900],
            "revenue": [1000, 1000, 2000, 2000],
            "fcf": [100, 20, 250, 50],
            "eps": [1500, 500, 3000, 1000],
            "bps": [10000, 10000, 10000, 10000],
            "price": [30000, 30000, 30000, 30000],
            "market_cap": [3e11, 1e11, 6e11, 2e11],
            "ret_12_1": [0.3, -0.1, 0.5, 0.0],
            "rev_growth": [0.2, 0.05, 0.4, 0.1],
            "eps_growth": [0.25, 0.0, 0.5, 0.1],
            "volatility": [0.2, 0.5, 0.15, 0.6],
        },
        index=[1, 2, 3, 4],
    )


def test_compute_raw_factors_directionality():
    raw = compute_raw_factors(_cross())
    # 종목1은 종목2보다 ROE 높고 부채 낮음 → quality 높아야
    assert raw.loc[1, "quality"] > raw.loc[2, "quality"]
    # 종목3은 모멘텀 최고
    assert raw["momentum"].idxmax() == 3
    # lowvol: 변동성 낮은 종목3이 가장 높아야 (음의 변동성)
    assert raw["lowvol"].idxmax() == 3


def test_zscore_factors_sector_neutral():
    raw = compute_raw_factors(_cross())
    z = zscore_factors(raw, _cross()["sector"])
    # 각 섹터 내 quality z-score 평균은 ~0
    sec = _cross()["sector"]
    for s in ["A", "B"]:
        vals = z.loc[sec[sec == s].index, "quality_z"].dropna()
        assert abs(vals.mean()) < 1e-9


def test_composite_alpha_weighted():
    raw = compute_raw_factors(_cross())
    z = zscore_factors(raw, _cross()["sector"])
    alpha = composite_alpha(z)
    assert len(alpha) == 4
    assert alpha.notna().all()


def test_composite_alpha_handles_missing_factor():
    # momentum 컬럼 없는 단면
    cross = _cross().drop(columns=["ret_12_1"])
    raw = compute_raw_factors(cross)
    z = zscore_factors(raw, cross["sector"])
    alpha = composite_alpha(z)
    # momentum 결측이어도 다른 팩터로 합성 (NaN 아님)
    assert alpha.notna().all()


def test_build_factor_scores_rows_and_rank():
    rows = build_factor_scores(_cross(), asof="2026-06-05")
    assert len(rows) == 4
    by_id = {r["instrument_id"]: r for r in rows}
    # 모든 행에 합성 알파·날짜·버전
    for r in rows:
        assert r["date"] == "2026-06-05"
        assert r["source_version"] == "factor-v1"
        assert r["composite_alpha"] is not None
    # 섹터 랭크는 섹터별 1..n
    a_ranks = sorted(by_id[i]["sector_rank"] for i in [1, 2])
    b_ranks = sorted(by_id[i]["sector_rank"] for i in [3, 4])
    assert a_ranks == [1, 2]
    assert b_ranks == [1, 2]


def test_build_factor_scores_empty():
    assert build_factor_scores(pd.DataFrame()) == []
