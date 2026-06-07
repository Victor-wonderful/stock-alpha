"""KRX 인제스트 변환 검증 — pykrx 한글 컬럼 DataFrame → 스키마 행 (네트워크 없음)."""
from __future__ import annotations

import pandas as pd

from engine.ingest import krx


def _ohlcv_df():
    idx = pd.to_datetime(["2026-06-01", "2026-06-02"])
    return pd.DataFrame(
        {
            "시가": [70000, 71000],
            "고가": [71500, 72000],
            "저가": [69500, 70500],
            "종가": [71000, 71800],
            "거래량": [10_000_000, 12_000_000],
        },
        index=idx,
    )


def test_normalize_ohlcv_maps_korean_columns():
    rows = krx.normalize_ohlcv(_ohlcv_df(), instrument_id=1)
    assert len(rows) == 2
    r = rows[0]
    assert r["instrument_id"] == 1
    assert r["interval"] == "1d"
    assert r["open"] == 70000.0
    assert r["high"] == 71500.0
    assert r["low"] == 69500.0
    assert r["close"] == 71000.0
    assert r["volume"] == 10_000_000.0
    assert r["ts"].startswith("2026-06-01")


def test_normalize_ohlcv_empty():
    assert krx.normalize_ohlcv(pd.DataFrame(), instrument_id=1) == []


def test_normalize_ohlcv_skips_incomplete_rows():
    df = pd.DataFrame({"시가": [100], "고가": [110]}, index=pd.to_datetime(["2026-06-01"]))
    # 저가/종가 없음 → 유효하지 않아 제외
    assert krx.normalize_ohlcv(df, instrument_id=1) == []


def test_normalize_flows_maps_investors():
    idx = pd.to_datetime(["2026-06-01", "2026-06-02"])
    df = pd.DataFrame(
        {"기관합계": [100, -50], "외국인합계": [-30, 80], "개인": [-70, -30]},
        index=idx,
    )
    rows = krx.normalize_flows(df, instrument_id=7)
    assert len(rows) == 2
    assert rows[0]["instrument_id"] == 7
    assert rows[0]["date"] == "2026-06-01"
    assert rows[0]["inst_net"] == 100.0
    assert rows[0]["foreign_net"] == -30.0
    assert rows[0]["retail_net"] == -70.0


def test_merge_short_into_flows():
    flows = [
        {"instrument_id": 7, "date": "2026-06-01", "inst_net": 100.0},
        {"instrument_id": 7, "date": "2026-06-02", "inst_net": -50.0},
    ]
    svol = pd.DataFrame({"공매도": [1000, 2000]}, index=pd.to_datetime(["2026-06-01", "2026-06-02"]))
    sbal = pd.DataFrame({"잔고수량": [5000, 6000]}, index=pd.to_datetime(["2026-06-01", "2026-06-02"]))
    merged = krx.merge_short_into_flows(flows, svol, sbal)
    by_date = {r["date"]: r for r in merged}
    assert by_date["2026-06-01"]["short_volume"] == 1000.0
    assert by_date["2026-06-01"]["short_balance"] == 5000.0
    assert by_date["2026-06-02"]["short_volume"] == 2000.0
    assert all(r["instrument_id"] == 7 for r in merged)


def test_merge_short_handles_missing_short_data():
    flows = [{"instrument_id": 7, "date": "2026-06-01", "inst_net": 100.0}]
    merged = krx.merge_short_into_flows(flows, None, None)
    assert merged == flows
