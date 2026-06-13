"""거래비용 모델 검증 — 비용이 R/순손익을 올바르게 잠식하는지 (네트워크 없음)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.backtest.costs import ZERO_COST, CostModel
from engine.backtest.event_backtest import backtest_playbook


def test_zero_cost_is_gross():
    c = ZERO_COST
    # 비용 0 → 순손익 = gross
    assert c.net_pnl(100.0, 110.0) == 10.0
    assert c.round_trip_cost(100.0, 110.0) == 0.0


def test_cost_reduces_pnl():
    c = CostModel(commission_pct=0.00015, tax_pct=0.0018, slippage_pct=0.0010)
    net = c.net_pnl(100.0, 110.0)
    assert net < 10.0  # 비용만큼 줄어듦
    # 라운드트립 비용 = 슬리피지(매수 100*0.001 + 매도 110*0.001) + 수수료((100+110)*0.00015)
    #                  + 거래세(110*0.0018)
    expected_cost = (100.0 * 0.001 + 110.0 * 0.001) + (210.0 * 0.00015) + (110.0 * 0.0018)
    assert abs(c.round_trip_cost(100.0, 110.0) - expected_cost) < 1e-9
    assert abs((10.0 - net) - expected_cost) < 1e-9


def test_cost_can_flip_small_winner_negative():
    # 손절폭 대비 작은 이익은 비용으로 음전 가능
    c = CostModel()
    # 진입 100, 청산 100.2 (gross +0.2) — 비용이 더 큼 → net 음수
    assert c.net_pnl(100.0, 100.2) < 0.0


def _rising_breakout_history() -> pd.DataFrame:
    # 20일 횡보 후 거래량 동반 상승 → breakout 트리거되는 단순 시계열
    base = np.full(30, 100.0)
    rise = np.linspace(100.0, 130.0, 40)
    close = np.concatenate([base, rise])
    high = close * 1.01
    low = close * 0.99
    return pd.DataFrame({
        "open": close, "high": high, "low": low, "close": close,
        "volume": np.concatenate([np.full(30, 1000.0), np.full(40, 3000.0)]),
        "ts": pd.date_range("2025-01-01", periods=70).astype(str),
    })


def test_backtest_net_le_gross():
    """비용 반영 백테스트의 R 합 ≤ 비용 미반영(gross) R 합."""
    df = _rising_breakout_history()
    net_trades = backtest_playbook(df, "breakout", min_lookback=20)
    gross_trades = backtest_playbook(df, "breakout", min_lookback=20, costs=ZERO_COST)
    if net_trades and gross_trades:
        net_sum = sum(t.r_multiple for t in net_trades)
        gross_sum = sum(t.r_multiple for t in gross_trades)
        assert net_sum <= gross_sum
        # r_gross 필드는 비용 무관하게 동일해야
        assert all(t.r_gross >= t.r_multiple - 1e-9 for t in net_trades)
