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


# ── 스케일아웃 청산 (처방2-2) ──
def _bars(rows):
    """rows: [(low, high, close)] → 합성 OHLC. 0번이 진입봉."""
    return pd.DataFrame({
        "low": [r[0] for r in rows],
        "high": [r[1] for r in rows],
        "close": [r[2] for r in rows],
    })


def test_exit_scaleout_runner_beats_single_on_extended_trend():
    from engine.backtest.costs import ZERO_COST
    from engine.backtest.event_backtest import _exit_scaleout, _exit_single
    # tp1(110) 후 tp2(120)까지 추세 연장 → 런이 더 먹는다.
    df = _bars([(100, 100, 100), (105, 111, 110), (112, 121, 120)])
    base = _exit_single(df, 0, len(df), 100, 95, 110, 10, ZERO_COST)
    scale = _exit_scaleout(df, 0, len(df), 100, 95, 110, 120, 10, ZERO_COST)
    assert base[0] == pytest.approx(10.0)     # 전량 tp1
    assert scale[0] == pytest.approx(15.0)    # 0.5*10(tp1) + 0.5*20(tp2)
    assert scale[0] > base[0]


def test_exit_scaleout_breakeven_caps_reversal():
    from engine.backtest.costs import ZERO_COST
    from engine.backtest.event_backtest import _exit_scaleout, _exit_single
    # tp1 후 되돌림 → 잔량 본전(entry) 청산. 분할이 단일보다 적게 먹는 트레이드오프.
    df = _bars([(100, 100, 100), (105, 111, 110), (99, 101, 100)])
    base = _exit_single(df, 0, len(df), 100, 95, 110, 10, ZERO_COST)
    scale = _exit_scaleout(df, 0, len(df), 100, 95, 110, 120, 10, ZERO_COST)
    assert base[0] == pytest.approx(10.0)
    assert scale[0] == pytest.approx(5.0)     # 0.5*10 + 0.5*0(본전)


def test_exit_scaleout_stop_before_tp1_matches_single():
    from engine.backtest.costs import ZERO_COST
    from engine.backtest.event_backtest import _exit_scaleout, _exit_single
    # tp1 전 손절 → 전량 손절(단일과 동일).
    df = _bars([(100, 100, 100), (94, 98, 95)])
    base = _exit_single(df, 0, len(df), 100, 95, 110, 10, ZERO_COST)
    scale = _exit_scaleout(df, 0, len(df), 100, 95, 110, 120, 10, ZERO_COST)
    assert base[0] == pytest.approx(-5.0)
    assert scale[0] == pytest.approx(-5.0)


def test_backtest_scaleout_flag_default_off():
    # scaleout=False(기본)는 기존 동작 — 회귀 방지.
    hist = _breakout_history()
    base = backtest_playbook(hist, "breakout", min_lookback=20)
    scale = backtest_playbook(hist, "breakout", min_lookback=20, scaleout=True)
    assert isinstance(base, list) and isinstance(scale, list)
    # 둘 다 트레이드를 내되, 청산 규칙이 달라 R 분포가 동일하지 않다.
    if base and scale:
        assert [t.r_multiple for t in base] != [t.r_multiple for t in scale]


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


# ── 워크포워드(하위기간 지속성) ──

def _fold_trades(start_iso: str, rs: list[float], step: int = 3) -> list[Trade]:
    """start_iso 부터 step 일 간격으로 진입일을 찍은 트레이드 묶음."""
    from datetime import date, timedelta
    d0 = date.fromisoformat(start_iso)
    return [
        Trade(r_multiple=r, ret_pct=r * 0.01, bars_held=3,
              entry_ts=(d0 + timedelta(days=i * step)).isoformat())
        for i, r in enumerate(rs)
    ]


def test_subperiod_expectancy_splits_by_calendar_time():
    # 4분기에 클러스터 배치 → 4개 하위기간, 과거 양(+)·최근 음(-)
    trades = (
        _fold_trades("2025-01-06", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-04-07", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-07-07", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-10-06", [-1.0] * 6 + [2.0] * 2)
    )
    sp = m.subperiod_expectancy(trades, 4)
    assert [f["n"] for f in sp] == [8, 8, 8, 8]
    assert sp[0]["expectancy_r"] > 0
    assert sp[3]["expectancy_r"] < 0


def test_subperiod_expectancy_ignores_undated_and_short():
    assert m.subperiod_expectancy(_trades([1, -1, 2]), 4) == []   # entry_ts 없음
    assert m.subperiod_expectancy([], 4) == []


def test_gate_fails_walkforward_on_recent_decay():
    # 전 구간 기대값은 +(과거 우위)지만 최근 하위기간이 음 → 발행 차단.
    trades = (
        _fold_trades("2025-01-06", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-04-07", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-07-07", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-10-06", [-1.0] * 6 + [2.0] * 2)   # 최근 -0.25R
    )
    # max_mdd 완화로 WF 만 단독 차단 요인이 되게 한다.
    gr = evaluate_gate(trades, GateThresholds(min_trades=20, max_mdd=1.0))
    assert gr.expectancy_r > 0.05                      # 전 구간 기대값은 통과 수준
    assert not gr.passed
    assert any("워크포워드" in r for r in gr.reasons)
    assert gr.walkforward["evaluable"] is True
    assert gr.walkforward["recent_expectancy_r"] < 0


def test_gate_passes_walkforward_consistent_edge():
    # 네 하위기간 모두 양(+) → WF 통과.
    trades = (
        _fold_trades("2025-01-06", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-04-07", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-07-07", [2.0] * 6 + [-1.0] * 2)
        + _fold_trades("2025-10-06", [2.0] * 6 + [-1.0] * 2)
    )
    gr = evaluate_gate(trades, GateThresholds(min_trades=20))
    assert gr.passed, gr.reasons
    assert gr.walkforward["evaluable"] is True
    assert gr.walkforward["ok"] is True


def test_gate_walkforward_noop_when_folds_sparse():
    # fold 당 표본<6 → 자격 하위기간 부족 → WF 무력(전체 기대값으로만 판정).
    five = [2.0, 2.0, -1.0, 2.0, -1.0]
    trades = (
        _fold_trades("2025-01-06", five)
        + _fold_trades("2025-04-07", five)
        + _fold_trades("2025-07-07", five)
        + _fold_trades("2025-10-06", [-1.0] * 5)
    )
    gr = evaluate_gate(trades, GateThresholds(min_trades=20, max_mdd=1.0))
    assert gr.walkforward["evaluable"] is False
    assert not any("워크포워드" in r for r in gr.reasons)


# ── 게이트 히스테리시스 (0020) ──

def test_hysteresis_first_run_takes_raw():
    from engine.backtest.runner import apply_hysteresis
    assert apply_hysteresis(True, None) is True
    assert apply_hysteresis(False, None) is False


def test_hysteresis_holds_single_flip():
    from engine.backtest.runner import apply_hysteresis
    # 직전: 안정화 PASS · 원측정 PASS → 이번 FAIL 1회는 보류(PASS 유지)
    assert apply_hysteresis(False, {"passed": True, "passed_raw": True}) is True
    # 반대 방향도 동일
    assert apply_hysteresis(True, {"passed": False, "passed_raw": False}) is False


def test_hysteresis_flips_on_second_consecutive():
    from engine.backtest.runner import apply_hysteresis
    # 직전: 안정화 PASS 였지만 원측정 FAIL → 이번도 FAIL = 2연속 → 전환
    assert apply_hysteresis(False, {"passed": True, "passed_raw": False}) is False
    assert apply_hysteresis(True, {"passed": False, "passed_raw": True}) is True


def test_hysteresis_agreement_passthrough():
    from engine.backtest.runner import apply_hysteresis
    assert apply_hysteresis(True, {"passed": True, "passed_raw": False}) is True
    assert apply_hysteresis(False, {"passed": False, "passed_raw": True}) is False


def test_hysteresis_legacy_rows_without_raw():
    from engine.backtest.runner import apply_hysteresis
    # passed_raw 없는 과거 행 — 원측정=안정화로 간주
    assert apply_hysteresis(False, {"passed": True, "passed_raw": None}) is True
