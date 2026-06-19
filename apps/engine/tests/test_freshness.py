"""신선도 가드 검증 — 낡은 OHLCV 로 '최신 종가 분석' 발행 차단 (네트워크 없음)."""
from __future__ import annotations

import pandas as pd

from engine import freshness as fr


def _frame(last_ts: str | None, n: int = 30) -> pd.DataFrame:
    cols = {c: [1.0] * n for c in ("open", "high", "low", "close", "volume")}
    df = pd.DataFrame(cols)
    if last_ts is not None:
        # 마지막 봉만 last_ts, 앞은 임의(가드는 마지막 봉만 본다)
        df["ts"] = [f"2026-06-{1 + (i % 9):02d}" for i in range(n - 1)] + [last_ts]
    return df


# ── frame_last_date ──
def test_frame_last_date_reads_last_ts():
    assert fr.frame_last_date(_frame("2026-06-19")) == "2026-06-19"


def test_frame_last_date_strips_time_component():
    df = _frame(None)
    df["ts"] = ["2026-06-19T00:00:00+00:00"] * len(df)
    assert fr.frame_last_date(df) == "2026-06-19"


def test_frame_last_date_none_without_ts_or_empty():
    assert fr.frame_last_date(_frame(None)) is None      # ts 컬럼 없음
    assert fr.frame_last_date(pd.DataFrame()) is None
    assert fr.frame_last_date(None) is None


# ── assess_dates ──
def test_assess_all_fresh_ok():
    last = {1: "2026-06-19", 2: "2026-06-19", 3: "2026-06-19"}
    a = fr.assess_dates(last, "2026-06-19")
    assert a["ok"] and a["fresh_frac"] == 1.0 and a["market_latest"] == "2026-06-19"


def test_assess_all_stale_aborts():
    # 06-19 사고 재현 — 종목별로 제각각 낡은 날짜, 아무도 as_of(19) 미보유
    last = {1: "2026-06-16", 2: "2026-06-12", 3: "2026-06-18"}
    a = fr.assess_dates(last, "2026-06-19")
    assert not a["ok"] and a["n_fresh"] == 0
    assert a["market_latest"] == "2026-06-18"   # 시장 최신은 보이되 as_of 미달


def test_assess_threshold_boundary():
    # 6/10 fresh = 0.6 → 경계 통과(>=). 5/10 = 0.5 → 미달.
    six = {i: ("2026-06-19" if i < 6 else "2026-06-18") for i in range(10)}
    assert fr.assess_dates(six, "2026-06-19")["ok"]
    five = {i: ("2026-06-19" if i < 5 else "2026-06-18") for i in range(10)}
    assert not fr.assess_dates(five, "2026-06-19")["ok"]


def test_assess_future_backfill_counts_as_fresh():
    # 과거일 백필(as_of=06-10): 모든 종목 최신 봉이 그 이상 → 전부 fresh, 통과.
    last = {1: "2026-06-19", 2: "2026-06-18"}
    a = fr.assess_dates(last, "2026-06-10")
    assert a["ok"] and a["n_fresh"] == 2


def test_assess_empty_not_ok():
    a = fr.assess_dates({}, "2026-06-19")
    assert not a["ok"] and a["market_latest"] is None


# ── fresh_frames (종목별 가드) ──
def test_fresh_frames_drops_stale_and_tsless():
    frames = {
        1: _frame("2026-06-19"),   # fresh
        2: _frame("2026-06-12"),   # stale → 제외
        3: _frame("2026-06-20"),   # as_of 이후 → fresh
        4: _frame(None),           # ts 없음 → 보수적 제외
    }
    fresh, stale = fr.fresh_frames(frames, "2026-06-19")
    assert set(fresh) == {1, 3}
    assert set(stale) == {2, 4}
