"""횡단면 백테스트 테스트 — 예측력 있는 단면은 PASS, 무작위는 FAIL (네트워크 없음)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.backtest.cross_section import (
    XsecThresholds,
    evaluate_cross_section,
    price_factor_scores,
)

N_BARS, N_NAMES = 320, 150


def _closes(persistent: bool, seed: int = 0) -> pd.DataFrame:
    """합성 종가 — persistent=True 면 종목별 고정 드리프트(모멘텀이 미래를 예측),
    False 면 드리프트 없는 잡음(예측 불가)."""
    rng = np.random.default_rng(seed)
    drift = rng.normal(0.0015, 0.0015, N_NAMES) if persistent else np.zeros(N_NAMES)
    noise = rng.normal(0, 0.01, (N_BARS, N_NAMES))
    rets = drift + noise
    prices = 100 * np.exp(np.cumsum(rets, axis=0))
    return pd.DataFrame(prices, columns=[f"s{i}" for i in range(N_NAMES)])


def test_persistent_drift_passes():
    r = evaluate_cross_section(_closes(persistent=True), XsecThresholds(min_periods=10))
    assert r.passed, r.reasons
    assert r.mean_ic is not None and r.mean_ic > 0.05
    assert r.excess_mean is not None and r.excess_mean > 0


def test_random_walk_fails():
    r = evaluate_cross_section(_closes(persistent=False), XsecThresholds(min_periods=10))
    assert not r.passed
    assert any("IC" in x or "초과수익" in x for x in r.reasons)


def test_insufficient_history_fails_on_sample():
    short = _closes(persistent=True).iloc[:210]  # start(201) 직후 → 표본 극소
    r = evaluate_cross_section(short, XsecThresholds(min_periods=10))
    assert not r.passed
    assert any("표본" in x for x in r.reasons)


def test_price_factor_scores_ranks_momentum():
    closes = _closes(persistent=True, seed=7)
    score = price_factor_scores(closes, i=250)
    # 점수 상위 종목의 실제 과거 모멘텀이 하위 종목보다 커야 함
    past = closes.iloc[250 - 21] / closes.iloc[250 - 21 - 120] - 1
    top = past[score.nlargest(15).index].mean()
    bottom = past[score.nsmallest(15).index].mean()
    assert top > bottom
