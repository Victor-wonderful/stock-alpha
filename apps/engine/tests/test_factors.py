"""멀티팩터 엔진 검증 — raw 팩터·z-score·합성 알파·랭크 (네트워크 없음)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.factors.compose import (
    DEFAULT_WEIGHTS,
    composite_alpha,
    regime_weights,
    zscore_factors,
)
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
        assert r["source_version"] == "factor-v2"
        assert r["composite_alpha"] is not None
    # 섹터 랭크는 섹터별 1..n
    a_ranks = sorted(by_id[i]["sector_rank"] for i in [1, 2])
    b_ranks = sorted(by_id[i]["sector_rank"] for i in [3, 4])
    assert a_ranks == [1, 2]
    assert b_ranks == [1, 2]


def test_build_factor_scores_empty():
    assert build_factor_scores(pd.DataFrame()) == []


# ── 레짐별 동적 가중 ──

def test_regime_weights_sum_to_one():
    for regime in ("risk_on", "risk_off", "neutral", None, "unknown"):
        w = regime_weights(regime)
        assert abs(sum(w.values()) - 1.0) < 1e-9


def test_regime_weights_neutral_and_unknown_are_default():
    assert regime_weights("neutral") == DEFAULT_WEIGHTS
    assert regime_weights(None) == DEFAULT_WEIGHTS
    assert regime_weights("garbage") == DEFAULT_WEIGHTS


def test_regime_weights_tilt_direction():
    # risk_on 은 모멘텀 가산, risk_off 는 가치·품질 가산 — 검증 집합 내 재분배.
    on, off, base = regime_weights("risk_on"), regime_weights("risk_off"), DEFAULT_WEIGHTS
    assert on["momentum"] > base["momentum"] > off["momentum"]
    assert off["value"] > base["value"] and off["quality"] > base["quality"]
    # 미검증 팩터(lowvol/size/growth)는 어떤 레짐에서도 도입되지 않는다.
    for w in (on, off):
        assert set(w) == {"value", "quality", "momentum"}


def test_build_factor_scores_source_version_records_regime():
    rows = build_factor_scores(
        _cross(), asof="2026-06-20",
        weights=regime_weights("risk_on"), source_version="factor-v2:risk_on",
    )
    assert all(r["source_version"] == "factor-v2:risk_on" for r in rows)


def test_regime_weighting_shifts_alpha_ranking():
    # 같은 단면이라도 레짐 가중에 따라 합성 알파(랭킹)가 달라져야 한다 —
    # 가중이 실제로 합성에 반영된다는 증거.
    raw = compute_raw_factors(_cross())
    z = zscore_factors(raw, _cross()["sector"])
    a_on = composite_alpha(z, regime_weights("risk_on"))
    a_off = composite_alpha(z, regime_weights("risk_off"))
    assert not a_on.equals(a_off)


def test_composite_alpha_all_nan_row():
    """회귀: 팩터 전무 종목(wsum=0)이 pd.NA→object dtype 으로 astype(float)
    를 죽이던 잠복 버그. 결과는 해당 종목만 NaN, 전체는 float."""
    z = pd.DataFrame(
        {"value_z": [1.0, np.nan], "momentum_z": [0.5, np.nan]},
        index=[1, 2],
    )
    alpha = composite_alpha(z)
    assert alpha.dtype == float
    assert alpha.notna()[1] and pd.isna(alpha[2])


def test_build_factor_scores_all_nan_instrument():
    """팩터 입력이 전무한 종목(시세 이력·재무 모두 없음)이 유효 섹터에 섞여도
    전체 런이 죽지 않는다 — 해당 종목의 z 가 전부 NaN → wsum=0 경로."""
    cross = _cross()
    # 섹터 A(다른 종목들은 유효값 보유)에 전무 종목 추가 → z 전부 NaN
    empty = pd.DataFrame(
        {c: [np.nan] for c in cross.columns if c != "sector"} | {"sector": ["A"]},
        index=[5],
    )
    rows = build_factor_scores(pd.concat([cross, empty]), asof="2026-06-11")
    assert len(rows) == 5
    by_id = {r["instrument_id"]: r for r in rows}
    assert by_id[5]["composite_alpha"] is None  # 팩터 전무 → NaN → None
    assert by_id[1]["composite_alpha"] is not None  # 정상 종목은 영향 없음


def test_build_factor_scores_object_dtype_none_mix():
    """회귀: None 혼합 컬럼(object dtype)이 concat/mean 경로에서 pd.NA 를
    만들어 astype(float) 를 죽이던 버그 (2026-06-11, growth YoY 배선 직후)."""
    cross = _cross()
    # DB 로더처럼 None 이 섞인 object 컬럼 재현
    cross["rev_growth"] = pd.Series([0.2, None, 0.4, None], index=cross.index, dtype=object)
    cross["eps_growth"] = pd.Series([None, None, 0.5, 0.1], index=cross.index, dtype=object)
    cross["net_income"] = pd.Series([150, None, 300, 100], index=cross.index, dtype=object)
    rows = build_factor_scores(cross, asof="2026-06-11")
    assert len(rows) == 4
    by_id = {r["instrument_id"]: r for r in rows}
    # growth 입력이 있는 종목은 growth_z 산출, 합성 알파는 전 종목 생성
    assert by_id[3]["growth_z"] is not None
    for r in rows:
        assert r["composite_alpha"] is not None
