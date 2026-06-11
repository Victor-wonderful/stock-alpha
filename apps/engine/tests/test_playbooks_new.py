"""신규 플레이북 4종 탐지기 테스트 — 합성 시계열로 트리거/비트리거 검증."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.signals.playbooks import (
    detect_flow_accumulation,
    detect_high_52w,
    detect_pullback,
    detect_vol_squeeze,
)


def _df(closes: list[float], *, vol: list[float] | None = None,
        spread: float = 1.0, last_open: float | None = None) -> pd.DataFrame:
    c = np.array(closes, dtype=float)
    o = c - 0.3
    if last_open is not None:
        o[-1] = last_open
    return pd.DataFrame({
        "open": o,
        "high": c + spread,
        "low": c - spread,
        "close": c,
        "volume": np.array(vol, dtype=float) if vol else np.full(len(c), 1000.0),
    })


# ── 눌림목 ──────────────────────────────────────────────────────────

def _pullback_closes() -> list[float]:
    rise = [100 + i for i in range(70)]            # 100→169 상승 추세
    dip = [169 - 1.2 * (i + 1) for i in range(8)]  # 고점 대비 ~-5% 조정(MA20 부근)
    bounce = [dip[-1] + 2.0]                       # 당일 반등
    return rise + dip + bounce


def test_pullback_triggers_on_dip_bounce():
    closes = _pullback_closes()
    cand = detect_pullback(_df(closes))
    assert cand is not None, "조정 후 반등에서 트리거돼야 함"
    assert cand.setup == "pullback" and cand.style == "swing"
    assert cand.support is not None  # MA20 지지


def test_detectors_survive_zero_prices():
    # 거래정지 이력(0원 가격)이 섞여도 크래시 없이 None — 600일 이력 확장에서
    # 실제로 ZeroDivisionError 가 발생했던 회귀 케이스.
    closes = [0.0] * 40 + [100 + i for i in range(40)]
    df = _df(closes)
    assert detect_pullback(df) is None or detect_pullback(df) is not None  # no raise
    assert detect_vol_squeeze(df) is None or True
    zero_df = _df([0.0] * 80)
    assert detect_pullback(zero_df) is None
    assert detect_vol_squeeze(zero_df) is None


def test_pullback_no_trigger_in_plain_uptrend():
    closes = [100 + i for i in range(80)]          # 조정 없는 직진 상승
    assert detect_pullback(_df(closes)) is None


# ── 52주 신고가 ─────────────────────────────────────────────────────

def test_high_52w_triggers():
    closes = [100.0] * 260 + [106.0]
    vol = [1000.0] * 260 + [3000.0]
    cand = detect_high_52w(_df(closes, vol=vol))
    assert cand is not None
    assert cand.style == "position"
    assert cand.support == 101.0  # 직전 1년 고가(100+spread)


def test_high_52w_requires_volume():
    closes = [100.0] * 260 + [106.0]
    assert detect_high_52w(_df(closes)) is None  # 거래량 평이 → 미트리거


# ── 변동성 수축 돌파 ─────────────────────────────────────────────────

def test_vol_squeeze_triggers_after_contraction():
    rng = np.random.default_rng(3)
    wide = list(100 + rng.normal(0, 3, 80))       # 변동 큰 구간
    tight = [100 + 0.05 * i for i in range(19)]   # 수축 구간
    closes = wide + tight + [104.0]               # 돌파 봉
    n = len(closes)
    vol = [1000.0] * (n - 1) + [3000.0]
    df = _df(closes, vol=vol, spread=0.3)
    # 수축 구간의 일중 변동을 더 좁게
    df.loc[80:, "high"] = df.loc[80:, "close"] + 0.2
    df.loc[80:, "low"] = df.loc[80:, "close"] - 0.2
    df.loc[df.index[-1], "high"] = 104.5
    cand = detect_vol_squeeze(df)
    assert cand is not None
    assert cand.payload["squeeze_rank"] <= 0.25


def test_vol_squeeze_no_trigger_without_breakout():
    closes = [100.0] * 100
    assert detect_vol_squeeze(_df(closes)) is None


# ── 수급 동반 매집 ───────────────────────────────────────────────────

def _flows(f: float, i: float, days: int = 10) -> pd.DataFrame:
    return pd.DataFrame({
        "date": [f"2026-06-{d:02d}" for d in range(1, days + 1)],
        "foreign_net": [f] * days,
        "inst_net": [i] * days,
    })


def test_flow_accumulation_triggers():
    closes = [100 + i * 0.5 for i in range(30)]    # 종가 > MA20 유지 상승
    cand = detect_flow_accumulation(_df(closes), flows=_flows(10_000, 5_000))
    assert cand is not None
    assert cand.setup == "flow_accumulation"
    assert cand.payload["pos_days"] == 10


def test_flow_accumulation_requires_both_buyers():
    closes = [100 + i * 0.5 for i in range(30)]
    # 기관이 순매도면 미트리거
    assert detect_flow_accumulation(_df(closes), flows=_flows(10_000, -5_000)) is None
    # flows 없으면 미트리거
    assert detect_flow_accumulation(_df(closes), flows=None) is None
