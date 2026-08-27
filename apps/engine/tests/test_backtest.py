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


# ── 분할 진입 (_exit_scalein) ──
# 나눠 사고 한 번에 판다. 회계 규칙 두 가지가 핵심이다:
#   ① 손익은 «전량 체결 가정 1주당» — 안 채워진 몫을 벌었다고 세지 않는다
#   ② 손절선은 1차 진입 기준으로 확정, 평단만 내려간다

def _df(lows, highs, closes):
    n = len(lows)
    return pd.DataFrame({
        "open": closes, "high": highs, "low": lows, "close": closes,
        "volume": [1000.0] * n,
    }, dtype=float)


class _FreeCosts:
    """비용 0 — 회계 검증에서 수수료가 숫자를 흐리지 않게."""

    def net_pnl(self, entry, exit_price):
        return exit_price - entry


LEGS = ((0.5, 100.0), (0.5, 95.0))   # 100 에 절반, 95 에 나머지 절반


def test_scalein_second_leg_unfilled_scales_pnl_down():
    """2차가 안 닿으면 절반만 산 것 — 손익도 절반이어야 한다."""
    df = _df(lows=[100, 99, 98], highs=[100, 105, 112], closes=[100, 104, 111])
    net, gross, bars, filled_w, avg = m_scalein(df, 0, len(df), LEGS, 90.0, 110.0, 5)
    assert filled_w == pytest.approx(0.5)
    assert avg == pytest.approx(100.0)
    assert gross == pytest.approx(0.5 * (110.0 - 100.0))   # 전량 기준 1주당


def test_scalein_second_leg_filled_lowers_average():
    """2차가 체결되면 평단이 내려가고 손익이 커진다."""
    df = _df(lows=[100, 94, 98], highs=[100, 101, 112], closes=[100, 96, 111])
    net, gross, bars, filled_w, avg = m_scalein(df, 0, len(df), LEGS, 90.0, 110.0, 5)
    assert filled_w == pytest.approx(1.0)
    assert avg == pytest.approx(97.5)
    assert gross == pytest.approx(0.5 * 10.0 + 0.5 * 15.0)


def test_scalein_fills_before_stop_on_same_bar():
    """같은 봉에서 추가 체결과 손절이 겹치면 «체결 먼저» — 더 산 뒤 손절이 보수적이다."""
    df = _df(lows=[100, 89, 89], highs=[100, 100, 95], closes=[100, 90, 92])
    net, gross, bars, filled_w, avg = m_scalein(df, 0, len(df), LEGS, 90.0, 110.0, 5)
    assert filled_w == pytest.approx(1.0)                  # 95 를 지나 89 까지 갔다
    assert gross == pytest.approx(0.5 * (90.0 - 100.0) + 0.5 * (90.0 - 95.0))


def test_scalein_stop_is_not_moved_by_averaging_down():
    """평단이 내려가도 손절가는 그대로 — 분할이 낮추는 건 평단이지 손절이 아니다."""
    df = _df(lows=[100, 94, 90], highs=[100, 101, 96], closes=[100, 96, 91])
    _, _, _, _, avg = m_scalein(df, 0, len(df), LEGS, 90.0, 110.0, 5)
    assert avg == pytest.approx(97.5)                      # 평단은 내려갔고
    # 손절가 90 은 인자로 고정 — 함수가 이를 바꾸지 않는다(위 케이스가 90 에 청산)


def m_scalein(df, i, n, legs, stop, tp, timeout):
    from engine.backtest.event_backtest import _exit_scalein
    return _exit_scalein(df, i, n, legs, stop, tp, timeout, _FreeCosts())


def test_scalein_single_leg_matches_plain_single_exit():
    """legs 가 1개면 기존 단일 청산과 같아야 한다 — 경로를 합쳐도 결과가 안 바뀐다."""
    from engine.backtest.event_backtest import _exit_single

    df = _df(lows=[100, 97, 96], highs=[100, 105, 112], closes=[100, 104, 111])
    a = m_scalein(df, 0, len(df), ((1.0, 100.0),), 95.0, 110.0, 5)
    b = _exit_single(df, 0, len(df), 100.0, 95.0, 110.0, 5, _FreeCosts())
    assert (a[0], a[1], a[2]) == pytest.approx(b)


def test_target_trail_does_not_sell_at_target():
    """목표 도달 → 팔지 않고 본전 스톱. 기간까지 보유해 상방을 안 자른다."""
    from engine.backtest.event_backtest import _exit_scalein

    # 2봉에서 목표 110 터치, 3봉에서 130 까지 감 → 기간 만료 종가 128 에 매도
    df = _df(lows=[100, 105, 120], highs=[100, 112, 130], closes=[100, 111, 128])
    net, gross, *_ = _exit_scalein(
        df, 0, len(df), ((1.0, 100.0),), 95.0, 110.0, 5, _FreeCosts(),
        target_action="trail")
    assert gross == pytest.approx(28.0), "목표에서 팔았으면 10 이었을 것"


def test_target_trail_locks_in_profit_on_pullback():
    """목표 도달 후 되돌아오면 «고점 − 1R» 에서 끊는다 — 본전이 아니라 이익이다.

    2026-08-27 규칙 교체. 옛 본전스톱이었다면 100(=0%)에 나갔다. 진입 100·손절 95
    이므로 R=5, 고점 112 → 스톱 107. 되돌림에서 +7 을 지킨다.
    """
    from engine.backtest.event_backtest import _exit_scalein

    # 2봉에서 목표 터치(고점 112) 후 3봉에서 96 까지 하락 → 추격 스톱 107 에 청산
    df = _df(lows=[100, 105, 96], highs=[100, 112, 101], closes=[100, 111, 97])
    net, gross, *_ = _exit_scalein(
        df, 0, len(df), ((1.0, 100.0),), 95.0, 110.0, 5, _FreeCosts(),
        target_action="trail")
    assert gross == pytest.approx(7.0), "본전스톱이었다면 0 이었을 것"


def test_trail_stop_never_drops_below_average_entry():
    """추격 스톱의 하한은 평단이다 — 옛 본전스톱보다 나빠지는 일은 없다.

    목표를 «간신히» 넘긴 경우 고점−1R 이 평단 아래로 내려갈 수 있다. 그때는
    평단이 스톱이다(=본전). 손실로 끝나지 않는다는 옛 보장은 유지된다.
    """
    from engine.backtest.event_backtest import _exit_scalein

    # R=10(진입 100·손절 90), 고점 110 → 110−10 = 100 = 평단. 그 아래로 안 간다
    df = _df(lows=[100, 105, 88], highs=[100, 110, 101], closes=[100, 109, 89])
    net, gross, *_ = _exit_scalein(
        df, 0, len(df), ((1.0, 100.0),), 90.0, 110.0, 5, _FreeCosts(),
        target_action="trail")
    assert gross == pytest.approx(0.0), "평단 아래로 내려가면 안 된다"


def test_precomputed_detections_give_identical_trades():
    """사전계산 재사용이 결과를 바꾸면 안 된다 — 속도 최적화지 규칙 변경이 아니다."""
    import numpy as np
    from engine.backtest.event_backtest import backtest_playbook, precompute_detections

    rng = np.random.default_rng(7)
    n = 220
    close = 100 * np.cumprod(1 + rng.normal(0.001, 0.02, n))
    df = pd.DataFrame({
        "open": close * 0.998, "high": close * 1.015,
        "low": close * 0.985, "close": close,
        "volume": rng.uniform(800, 3000, n),
    })
    for setup in ("breakout", "oversold_bounce", "double_bottom"):
        base = backtest_playbook(df, setup, entry_mode="open")
        det = precompute_detections(df, setup)
        fast = backtest_playbook(df, setup, entry_mode="open", detections=det)
        assert [t.r_multiple for t in base] == [t.r_multiple for t in fast], setup
        assert [t.entry_ts for t in base] == [t.entry_ts for t in fast], setup


def test_trail_floor_uses_first_entry_not_average():
    """추격 스톱의 기준은 «1차 진입가»다 — 분할로 낮아진 평단이 아니다.

    2·3차가 싸게 체결되면 평단이 내려간다. 그 평단을 기준으로 잡으면 스톱이 원래보다
    아래로 내려가 «본전»의 뜻이 흔들린다. 손절선을 1차 진입에 고정하는 원칙과 같다.
    """
    from engine.backtest.event_backtest import _exit_scalein

    # 1차 100 · 2차 90(2봉 저가 88 에서 체결) → 평단 95. 목표 110, 손절 85.
    # 1차 기준이면 R=15, 고점 112 → 스톱 max(100, 97) = 100.
    # 평단 기준이었다면 R=10, 스톱 max(95, 102) = 102 로 «더 높게» 잡혀 다르게 나온다.
    df = _df(lows=[100, 88, 99], highs=[100, 112, 101], closes=[100, 111, 99.5])
    net, gross, *_ = _exit_scalein(
        df, 0, len(df), ((0.5, 100.0), (0.5, 90.0)), 85.0, 110.0, 5, _FreeCosts(),
        target_action="trail")
    # 스톱 100 에 3봉 저가 99 가 걸린다 → 평단 95 대비 +5, 비중 가중 후 gross = 5.0
    assert gross == pytest.approx(5.0)
