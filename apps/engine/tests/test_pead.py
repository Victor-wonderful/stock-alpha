"""PEAD(실적 모멘텀) — 어닝 이벤트 빌더 + 탐지기 테스트 (네트워크 없음)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from engine.signals.earnings import build_earnings_events
from engine.signals.playbooks import detect_pead


# ── build_earnings_events ───────────────────────────────────────────

def _fin(period: str, *, op=None, ni=None, rev=None, disclosed=None,
         fs="consolidated") -> dict:
    return {"period": period, "fs_type": fs, "op_income": op, "net_income": ni,
            "revenue": rev, "disclosed_at": disclosed}


def test_events_yoy_surprise():
    rows = [
        _fin("2025Q1", op=100.0, rev=1000.0, disclosed="2025-05-15"),
        _fin("2026Q1", op=150.0, rev=1200.0, disclosed="2026-05-15"),
    ]
    ev = build_earnings_events(rows)
    assert len(ev) == 1
    assert ev[0]["date"] == "2026-05-15"
    assert abs(ev[0]["surprise"] - 0.5) < 1e-9
    assert not ev[0]["turnaround"]
    assert abs(ev[0]["rev_growth"] - 0.2) < 1e-9


def test_events_turnaround_and_loss_excluded():
    rows = [
        _fin("2025Q1", op=-50.0, disclosed="2025-05-15"),
        _fin("2026Q1", op=80.0, disclosed="2026-05-15"),   # 흑자전환
        _fin("2024FY", op=100.0, disclosed="2025-03-20"),
        _fin("2025FY", op=-10.0, disclosed="2026-03-20"),  # 적자 → 이벤트 아님
    ]
    ev = build_earnings_events(rows)
    assert len(ev) == 1
    assert ev[0]["turnaround"] and ev[0]["surprise"] == 1.0


def test_events_require_disclosed_at_and_pair():
    rows = [
        _fin("2025Q1", op=100.0, disclosed=None),          # 공시일 없음 → 제외
        _fin("2026Q1", op=150.0, disclosed="2026-05-15"),  # 전년 짝의 공시일과 무관
        _fin("2025Q3", op=100.0, disclosed="2025-11-14"),  # 짝(2024Q3) 없음
    ]
    # 2026Q1 의 짝 2025Q1 은 있고(공시일은 비교 대상엔 불필요) → 이벤트 1
    ev = build_earnings_events(rows)
    assert len(ev) == 1 and ev[0]["period"] == "2026Q1"


def test_events_net_income_fallback():
    rows = [
        _fin("2025Q1", ni=100.0, disclosed="2025-05-15"),
        _fin("2026Q1", ni=130.0, disclosed="2026-05-15"),
    ]
    ev = build_earnings_events(rows)
    assert len(ev) == 1 and abs(ev[0]["surprise"] - 0.3) < 1e-9


# ── detect_pead ─────────────────────────────────────────────────────

def _df(closes: list[float], start: str = "2026-05-01") -> pd.DataFrame:
    c = np.array(closes, dtype=float)
    ts = pd.date_range(start, periods=len(c), freq="D").strftime("%Y-%m-%d")
    return pd.DataFrame({
        "open": c - 0.3, "high": c + 1.0, "low": c - 1.0, "close": c,
        "volume": np.full(len(c), 1000.0), "ts": ts,
    })


def _events(date: str, surprise: float = 0.5) -> pd.DataFrame:
    return pd.DataFrame([{"date": date, "surprise": surprise,
                          "turnaround": False, "period": "2026Q1"}])


def test_pead_triggers_after_disclosure():
    # 30봉 상승(종가>MA20), 마지막 봉 2026-05-30, 공시 5-28(2일 전)
    closes = [100 + i * 0.5 for i in range(30)]
    cand = detect_pead(_df(closes), earnings=_events("2026-05-28"))
    assert cand is not None
    assert cand.setup == "pead" and cand.style == "position"
    assert cand.payload["surprise"] == 0.5


def test_pead_no_trigger_before_disclosure():
    # 공시일이 마지막 봉 이후(미래) → point-in-time 차단
    closes = [100 + i * 0.5 for i in range(30)]
    assert detect_pead(_df(closes), earnings=_events("2026-06-15")) is None


def test_pead_no_trigger_when_stale_or_weak():
    closes = [100 + i * 0.5 for i in range(30)]
    # 공시 후 너무 오래 지남(>6일)
    assert detect_pead(_df(closes), earnings=_events("2026-05-10")) is None
    # 서프라이즈 미달
    assert detect_pead(_df(closes), earnings=_events("2026-05-28", 0.1)) is None
    # 이벤트 없음
    assert detect_pead(_df(closes), earnings=None) is None


def test_pead_requires_price_confirmation():
    # 하락 추세(종가<MA20)면 서프라이즈가 커도 미트리거
    closes = [130 - i for i in range(30)]
    assert detect_pead(_df(closes), earnings=_events("2026-05-28", 2.0)) is None
