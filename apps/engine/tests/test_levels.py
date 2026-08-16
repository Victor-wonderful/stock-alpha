"""가격 레벨 산출 검증 — docs/PLAN.md 검증 항목 '스타일 가격 산출' 대응."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from engine.signals.levels import compute_levels
from engine.signals.styles import STYLES


def test_buy_levels_basic_geometry():
    lv = compute_levels(
        style="swing", side="buy", entry_price=70000, atr=1500, risk_per_trade_pct=1.0,
    )
    # 매수: 손절 < 진입 < tp1 < tp2 < tp3
    assert lv.stop_loss < lv.entry_price < lv.tp1 < lv.tp2 < lv.tp3
    assert lv.risk_reward > 0
    assert lv.position_size_pct > 0


def test_sell_levels_inverted():
    lv = compute_levels(
        style="swing", side="sell", entry_price=70000, atr=1500, risk_per_trade_pct=1.0,
    )
    # 매도: 손절 > 진입 > tp1 > tp2 > tp3
    assert lv.stop_loss > lv.entry_price > lv.tp1 > lv.tp2 > lv.tp3


def test_position_sizing_matches_risk_budget():
    """손절 시 손실이 계좌의 risk_per_trade_pct% 와 일치해야 한다."""
    entry, atr, risk_pct = 100.0, 5.0, 1.0
    lv = compute_levels(
        style="swing", side="buy", entry_price=entry, atr=atr,
        risk_per_trade_pct=risk_pct, max_position_pct=100.0,
    )
    stop_distance_ratio = abs(entry - lv.stop_loss) / entry
    realized_risk = lv.position_size_pct * stop_distance_ratio  # = % 계좌 손실
    assert realized_risk == pytest.approx(risk_pct, rel=1e-6)


def test_position_size_capped():
    lv = compute_levels(
        style="scalping", side="buy", entry_price=100, atr=0.1,
        risk_per_trade_pct=5.0, max_position_pct=25.0,
    )
    assert lv.position_size_pct <= 25.0


def test_styles_produce_different_levels_for_same_input():
    """같은 종목·입력이라도 스타일별로 손절/목표가 달라야 한다."""
    common = dict(side="buy", entry_price=70000, atr=1500, risk_per_trade_pct=1.0)
    stops = {s: compute_levels(style=s, **common).stop_loss for s in STYLES}
    # 스타일별 stop_atr_mult 가 다르므로 손절이 모두 동일하면 안 됨
    assert len(set(round(v, 2) for v in stops.values())) == len(STYLES)


def test_day_style_valid_until_respects_market_close():
    now = datetime(2026, 6, 5, 10, 0, tzinfo=timezone.utc)
    close = datetime(2026, 6, 5, 14, 0, tzinfo=timezone.utc)
    lv = compute_levels(
        style="day", side="buy", entry_price=70000, atr=1500, risk_per_trade_pct=1.0,
        now=now, market_close=close,
    )
    assert lv.valid_until == close  # 당일 청산 → 장마감 만료


def test_support_tightens_buy_stop():
    no_sup = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
    )
    with_sup = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=98.0,
    )
    # 지지(98)가 ATR 손절(100-18=82)보다 타이트 → 손절이 위로 당겨짐
    assert with_sup.stop_loss > no_sup.stop_loss


def test_invalid_inputs():
    with pytest.raises(ValueError):
        compute_levels(style="swing", side="buy", entry_price=0, atr=1, risk_per_trade_pct=1)
    with pytest.raises(ValueError):
        compute_levels(style="swing", side="buy", entry_price=100, atr=0, risk_per_trade_pct=1)
    with pytest.raises(ValueError):
        compute_levels(style="swing", side="long", entry_price=100, atr=1, risk_per_trade_pct=1)


# ── 손절폭 하한 (2026-08-16) ──
# 지지선이 코앞이면 손절도 코앞이 됐고, 그러면 회사에 아무 일이 없어도 평범한 하루
# 등락에 잘려나갔다(실측: 손절 68건 중 19건이 하루 만에). 하루치 움직임(1×ATR) 안쪽
# 손절은 '논리가 틀렸다'는 신호가 아니라 잡음이다.

def test_stop_never_closer_than_one_atr():
    """지지가 코앞(0.2×ATR)이어도 손절은 1×ATR 밖."""
    lv = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=98.0,
    )
    assert 100 - lv.stop_loss >= 10 - 1e-9


def test_floor_does_not_widen_beyond_atr_stop():
    """하한을 지키되 ATR 손절보다 멀어지진 않는다."""
    lv = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=99.5,
    )
    assert lv.stop_loss >= 100 - 18            # swing ATR 손절 = 1.8×ATR
    assert lv.stop_loss <= 100 - 10


def test_support_at_reasonable_distance_still_used():
    """적당한 거리(1~1.5×ATR 사이)의 지지는 그대로 손절로 쓴다."""
    lv = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=88.0,
    )
    assert lv.stop_loss == pytest.approx(88.0 * 0.999)


def test_far_support_still_falls_back_to_atr():
    """멀리 있는 지지는 여전히 무시(-47% 손절 사고 방지 규칙 유지)."""
    lv = compute_levels(
        style="position", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=40.0,
    )
    assert lv.stop_loss == pytest.approx(70.0)   # position ATR 손절 = 3×ATR


def test_sell_side_floor():
    lv = compute_levels(
        style="swing", side="sell", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        resistance=102.0,
    )
    assert lv.stop_loss - 100 >= 10 - 1e-9


# ── 셋업별 손절 하한 (2026-08-16) ──
# 하한을 전 셋업에 걸었더니 30조합 중 19개는 좋아지고 10개는 나빠졌다. 나빠진 쪽은
# 전부 '바로 밑이 바닥'을 근거로 사는 계열이었다 — 그 바닥 아래가 손절이어야 논리가
# 성립하므로 하한을 걸면 근거가 사라진다. 그래서 추세 계열에만 건다.

def test_trend_setup_gets_floor():
    lv = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=98.0, setup="breakout",
    )
    assert 100 - lv.stop_loss >= 10 - 1e-9


def test_counter_trend_setup_keeps_tight_structure():
    """과대낙폭 반등은 반전 저점 바로 아래가 손절이어야 한다."""
    lv = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=98.0, setup="oversold_bounce",
    )
    assert lv.stop_loss == pytest.approx(98.0 * 0.999)


@pytest.mark.parametrize("setup", ["sigma", "quantile", "capitulation",
                                   "double_bottom", "anchor_pullback",
                                   "flow_accumulation", "pivot"])
def test_all_structure_first_setups_exempt(setup):
    lv = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=99.0, setup=setup,
    )
    assert lv.stop_loss == pytest.approx(99.0 * 0.999)


def test_unknown_setup_defaults_to_floor():
    """새 셋업을 추가할 때 기본값은 '하한 적용' — 안전한 쪽으로 실패한다."""
    lv = compute_levels(
        style="swing", side="buy", entry_price=100, atr=10, risk_per_trade_pct=1.0,
        support=99.0, setup="brand_new_setup",
    )
    assert 100 - lv.stop_loss >= 10 - 1e-9


def test_far_support_ignored_regardless_of_setup():
    """멀리 있는 지지는 어느 계열이든 무시(-47% 손절 사고 방지 규칙 유지)."""
    for setup in ("breakout", "oversold_bounce"):
        lv = compute_levels(
            style="position", side="buy", entry_price=100, atr=10,
            risk_per_trade_pct=1.0, support=40.0, setup=setup,
        )
        assert lv.stop_loss == pytest.approx(70.0)
