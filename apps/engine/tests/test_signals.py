"""플레이북 탐지 + 시그널 생성 검증 (네트워크 없음)."""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pandas as pd

from engine.signals import playbooks
from engine.signals.generate import generate_signals


def _mk(opens, highs, lows, closes, vols):
    return pd.DataFrame({
        "open": opens, "high": highs, "low": lows, "close": closes, "volume": vols,
    }, dtype=float)


def _uptrend(n=60, start=100.0, step=1.5):
    closes = np.array([start + i * step for i in range(n)])
    return _mk(closes - 0.5, closes + 1.0, closes - 1.0, closes, np.full(n, 1000.0))


# ── 주도주 추세 ──
def test_leader_trend_triggers_on_uptrend():
    df = _uptrend()
    c = playbooks.detect_leader_trend(df)
    assert c is not None and c.setup == "leader_trend" and c.side == "buy"


def test_leader_trend_rs_rank_boosts_strength():
    df = _uptrend()
    base = playbooks.detect_leader_trend(df, rs_rank=0.5)
    boosted = playbooks.detect_leader_trend(df, rs_rank=0.9)
    assert boosted.strength > base.strength


def test_leader_trend_no_trigger_on_downtrend():
    df = _uptrend()
    df = df.iloc[::-1].reset_index(drop=True)  # 하락 반전
    assert playbooks.detect_leader_trend(df) is None


# ── 과대낙폭 반등 ──
def test_oversold_bounce_triggers():
    # 투매(30봉 급락) 후 강한 반전 양봉(거래량 동반) — 새 역추세 조건 충족
    decline = list(np.linspace(100, 62, 30))
    closes = decline + [64.0]                       # 반전봉 종가(+3.2%)
    opens = [c + 0.3 for c in decline] + [62.2]     # 반전봉 양봉(close>open)
    highs = [c + 0.5 for c in decline] + [64.2]     # 종가 고가권
    lows = [c - 0.5 for c in decline] + [61.9]
    vols = [1000.0] * 30 + [2500.0]                 # 거래량 급증
    df = _mk(opens, highs, lows, closes, vols)
    c = playbooks.detect_oversold_bounce(df)
    assert c is not None and c.setup == "oversold_bounce"


def test_oversold_no_trigger_on_weak_bounce():
    # 과매도·투매여도 반전 확인이 약하면(전일 종가 +1% 미만, 종가 저가권) 트리거 안 함.
    decline = list(np.linspace(100, 62, 30))
    closes = decline + [62.2]                        # +0.3% — 약한 반등
    opens = [c + 0.3 for c in decline] + [62.1]
    highs = [c + 0.5 for c in decline] + [63.5]      # 종가가 고가권 아님
    lows = [c - 0.5 for c in decline] + [61.9]
    vols = [1000.0] * 30 + [2500.0]
    df = _mk(opens, highs, lows, closes, vols)
    assert playbooks.detect_oversold_bounce(df) is None


# ── 돌파 ──
def test_breakout_triggers_with_volume():
    closes = [100.0] * 24 + [106.0]
    highs = [101.0] * 24 + [106.5]
    vols = [1000.0] * 24 + [3000.0]
    df = _mk([100.0] * 25, highs, [99.0] * 25, closes, vols)
    c = playbooks.detect_breakout(df, lookback=20)
    assert c is not None and c.setup == "breakout"
    assert c.support == 101.0  # 돌파 레벨이 지지로


def test_breakout_no_trigger_without_volume():
    closes = [100.0] * 24 + [106.0]
    highs = [101.0] * 24 + [106.5]
    vols = [1000.0] * 25  # 거래량 증가 없음
    df = _mk([100.0] * 25, highs, [99.0] * 25, closes, vols)
    assert playbooks.detect_breakout(df, lookback=20) is None


# ── 종가베팅 ──
def test_close_betting_triggers():
    df = _mk([100.0] * 19 + [100.0], [101.0] * 19 + [106.0],
             [99.0] * 19 + [99.0], [100.0] * 19 + [105.0],
             [1000.0] * 19 + [2000.0])
    c = playbooks.detect_close_betting(df)
    assert c is not None and c.setup == "close_betting"
    assert c.style == "day" and c.session == "close"


# ── 시그널 생성 (조립) ──
def test_generate_signals_assembles_rows():
    df = _uptrend()
    rows = generate_signals(df, instrument_id=5, risk_per_trade_pct=1.0, rs_rank=0.9)
    assert len(rows) >= 1
    r = next(r for r in rows if r["setup"] == "leader_trend")
    assert r["instrument_id"] == 5
    assert r["signal_type"] == "buy"
    assert r["style"] == "position"  # 2026-06-13 비용 반영 재설계: 추세셋업 position 전환
    assert r["session"] == "regular"
    assert r["stop_loss"] < r["entry_price"] < r["tp1"]
    assert r["source_version"] == "signal-v1"
    assert r["llm_rationale"]


def test_generate_signals_matrix_emits_per_passing_style():
    """styles_by_setup 주어지면 한 트리거가 통과 스타일마다 1행 발행 (매트릭스)."""
    df = _uptrend()
    rows = generate_signals(
        df, instrument_id=5, risk_per_trade_pct=1.0, rs_rank=0.9,
        styles_by_setup={"leader_trend": ["swing", "position"]},
    )
    lt = [r for r in rows if r["setup"] == "leader_trend"]
    styles = {r["style"] for r in lt}
    assert styles == {"swing", "position"}, f"두 스타일 모두 발행돼야: {styles}"
    # 각 행의 holding_horizon 이 스타일에 맞게 다르게 산출됨
    by_style = {r["style"]: r for r in lt}
    assert by_style["swing"]["holding_horizon"] != by_style["position"]["holding_horizon"]


def test_generate_signals_close_betting_valid_until_is_close():
    now = datetime(2026, 6, 5, 10, 0, tzinfo=timezone.utc)
    close = datetime(2026, 6, 5, 6, 30, tzinfo=timezone.utc)  # 한국 장마감(UTC)
    df = _mk([100.0] * 19 + [100.0], [101.0] * 19 + [106.0],
             [99.0] * 19 + [99.0], [100.0] * 19 + [105.0],
             [1000.0] * 19 + [2000.0])
    rows = generate_signals(df, instrument_id=1, setups=["close_betting"],
                            now=now, market_close=close)
    assert len(rows) == 1
    # 종가베팅(day, intraday_only) → valid_until 은 장마감 기준
    assert rows[0]["valid_until"] is not None


def test_generate_signals_filter_setups():
    df = _uptrend()
    rows = generate_signals(df, instrument_id=1, setups=["oversold_bounce"])
    # 상승추세엔 과대낙폭 트리거 없음
    assert rows == []
