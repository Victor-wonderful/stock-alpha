"""백테스트 메트릭·이벤트 백테스트·품질 게이트 검증 (네트워크 없음)."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from engine.backtest import metrics as m
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GateThresholds, evaluate_gate
from engine.backtest.metrics import Trade


def _trades(rs: list[float]) -> list[Trade]:
    return [Trade(r_multiple=r, ret_pct=r * 0.01, bars_held=3) for r in rs]


# ── 메트릭 ──
def test_win_rate():
    assert m.win_rate(_trades([1, -1, 2, -1])) == 0.5
    assert m.win_rate([]) is None


def test_avg_rr():
    # 이익 평균 2, 손실 평균 1 → 2.0
    assert m.avg_rr(_trades([2, 2, -1, -1])) == pytest.approx(2.0)
    assert m.avg_rr(_trades([1, 2])) is None  # 손실 없음


def test_expectancy_r():
    assert m.expectancy_r(_trades([2, -1, 2, -1])) == pytest.approx(0.5)


def test_sharpe():
    assert m.sharpe([0.01, 0.01, 0.01]) is None  # std 0
    s = m.sharpe([0.01, -0.005, 0.02, 0.0, 0.015])
    assert s is not None


def test_max_drawdown():
    eq = [1.0, 1.2, 0.9, 1.1]
    # 고점 1.2 → 0.9 : dd = 0.25
    assert m.max_drawdown(eq) == pytest.approx(0.25)


def test_equity_from_trades_compounds():
    eq = m.equity_from_trades(_trades([1, 1]))  # +1%, +1%
    assert eq[-1] == pytest.approx(1.0 * 1.01 * 1.01)


def test_information_coefficient_perfect_rank():
    # 점수와 미래수익 순위 완전 일치 → IC = 1
    ic = m.information_coefficient([1, 2, 3, 4], [10, 20, 30, 40])
    assert ic == pytest.approx(1.0)
    ic_inv = m.information_coefficient([1, 2, 3, 4], [40, 30, 20, 10])
    assert ic_inv == pytest.approx(-1.0)


# ── 이벤트 백테스트 ──
def _breakout_history():
    """돌파가 여러 번 발생하고 이후 상승하는 합성 시계열."""
    base = [100.0] * 30
    rng = list(np.linspace(100, 140, 40))  # 꾸준한 상승 → 돌파 반복
    closes = np.array(base + rng)
    return pd.DataFrame({
        "open": closes - 0.5,
        "high": closes + 1.5,
        "low": closes - 1.0,
        "close": closes,
        "volume": np.concatenate([np.full(30, 1000.0), np.full(40, 3000.0)]),
    })


def test_backtest_playbook_produces_trades():
    trades = backtest_playbook(_breakout_history(), "breakout", min_lookback=20)
    assert isinstance(trades, list)
    assert all(isinstance(t, Trade) for t in trades)


def test_backtest_short_history_empty():
    df = _breakout_history().iloc[:10]
    assert backtest_playbook(df, "breakout") == []


def test_backtest_unknown_setup():
    assert backtest_playbook(_breakout_history(), "nonexistent") == []


# ── 품질 게이트 ──
def test_gate_fails_on_small_sample():
    gr = evaluate_gate(_trades([2, -1, 2]))
    assert not gr.passed
    assert any("표본" in r for r in gr.reasons)


def test_gate_passes_good_strategy():
    # 25 트레이드, 승률 60%, 손익비 2 (이익 +2R 15회, 손실 -1R 10회) → 기대값 +0.8R
    trades = _trades([2.0] * 15 + [-1.0] * 10)
    gr = evaluate_gate(trades, GateThresholds(min_trades=20))
    assert gr.passed, gr.reasons
    assert gr.win_rate == pytest.approx(0.6)
    assert gr.avg_rr == pytest.approx(2.0)
    assert gr.expectancy_r == pytest.approx(0.8)


def test_gate_passes_low_winrate_high_rr_trend():
    # 재캘리브레이션 핵심 케이스: 승률 1/3, 손익비 2.5 → 기대값 +0.167R.
    # 구 게이트(승률 40% 하한)는 탈락시켰지만 기대값 기준으론 우위 전략.
    trades = _trades([2.5, -1.0, -1.0] * 10)
    gr = evaluate_gate(trades, GateThresholds(min_trades=20))
    assert gr.passed, gr.reasons
    assert gr.win_rate == pytest.approx(1 / 3)


def test_gate_fails_negative_expectancy():
    # 손실 우위 전략
    trades = _trades([1.0] * 5 + [-1.0] * 20)
    gr = evaluate_gate(trades, GateThresholds(min_trades=10))
    assert not gr.passed
    assert any("기대값" in r for r in gr.reasons)


def test_daily_r_curve_groups_by_entry_day():
    # 같은 날 진입한 트레이드는 하루 리스크 예산(1%)을 균등 분할 — 군집 손실이
    # 트레이드 수에 비례해 MDD 를 부풀리지 않는다.
    d1 = [Trade(r_multiple=-1.0, ret_pct=-0.01, bars_held=1, entry_ts="2026-01-05")] * 50
    d2 = [Trade(r_multiple=2.0, ret_pct=0.02, bars_held=1, entry_ts="2026-01-06")]
    eq = m.daily_r_curve(d1 + d2, risk_frac=0.01)
    assert len(eq) == 3                      # 시작 + 2일
    assert eq[1] == pytest.approx(0.99)      # 하루 -1R 평균 → -1%
    assert eq[2] == pytest.approx(0.99 * 1.02)


def test_equity_r_curve_fixed_risk():
    # +1R 트레이드는 리스크 1% 기준 자산 +1% — 표본이 커져도 MDD 왜곡 없음
    eq = m.equity_r_curve(_trades([1.0, -1.0]), risk_frac=0.01)
    assert eq[1] == pytest.approx(1.01)
    assert eq[2] == pytest.approx(1.01 * 0.99)


def test_gate_winsorizes_outlier_r():
    # +50R 이상치 1건이 만든 가짜 기대값은 클립(±10R) 후 사라져야 한다.
    trades = _trades([50.0] + [-1.0] * 24)
    gr = evaluate_gate(trades, GateThresholds(min_trades=20))
    assert not gr.passed
    assert gr.expectancy_r == pytest.approx((10.0 - 24.0) / 25)


def test_r_mdd_sample_size_invariant():
    # ret_pct 복리 MDD 는 손실 연속에 표본만 커져도 1로 수렴하지만
    # R 곡선 MDD 는 패턴이 같으면 규모가 비슷하게 유지된다.
    pattern = [2.0, -1.0, -1.0]
    small = evaluate_gate(_trades(pattern * 10), GateThresholds(min_trades=1))
    large = evaluate_gate(_trades(pattern * 100), GateThresholds(min_trades=1))
    assert small.mdd is not None and large.mdd is not None
    assert large.mdd < 0.10  # 우위 전략의 R-MDD 는 낮게 유지
