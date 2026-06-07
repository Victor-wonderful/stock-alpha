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
