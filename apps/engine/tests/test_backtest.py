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
    # 25 트레이드, 승률 60%, 손익비 2 (이익 +2R 15회, 손실 -1R 10회)
    trades = _trades([2.0] * 15 + [-1.0] * 10)
    thr = GateThresholds(min_trades=20, min_win_rate=0.4, min_avg_rr=1.3, max_mdd=0.9)
    gr = evaluate_gate(trades, thr)
    assert gr.passed, gr.reasons
    assert gr.win_rate == pytest.approx(0.6)
    assert gr.avg_rr == pytest.approx(2.0)


def test_gate_fails_negative_expectancy():
    # 손실 우위 전략
    trades = _trades([1.0] * 5 + [-1.0] * 20)
    gr = evaluate_gate(trades, GateThresholds(min_trades=10))
    assert not gr.passed
