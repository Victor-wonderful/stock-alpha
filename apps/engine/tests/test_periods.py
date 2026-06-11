"""periods — 재무 period 헬퍼·YoY 성장률 (순수 함수)."""
from engine.fundamental.periods import (
    is_annual,
    latest_annual,
    parse_period,
    prior_same_period,
    yoy_growth,
)


def _row(period: str, *, rev=None, ni=None, fs="consolidated") -> dict:
    return {"period": period, "fs_type": fs, "revenue": rev, "net_income": ni}


def test_parse_and_annual():
    assert parse_period("2025Q1") == (2025, "Q1")
    assert parse_period("2024FY") == (2024, "FY")
    assert parse_period("garbage") is None
    assert parse_period(None) is None
    assert is_annual("2024FY") and not is_annual("2025Q1")


def test_prior_same_period():
    assert prior_same_period("2026Q1") == "2025Q1"
    assert prior_same_period("2025FY") == "2024FY"
    assert prior_same_period("2025H1") == "2024H1"


def test_latest_annual_skips_quarters():
    rows = [_row("2024FY"), _row("2026Q1"), _row("2025FY"), _row("2025Q3")]
    # 문자열 정렬상 2026Q1 이 최신이지만 연간은 2025FY
    assert latest_annual(rows)["period"] == "2025FY"
    assert latest_annual([_row("2026Q1")]) is None


def test_latest_annual_prefers_consolidated():
    rows = [_row("2025FY", fs="separate"), _row("2025FY", fs="consolidated")]
    assert latest_annual(rows)["fs_type"] == "consolidated"


def test_yoy_growth_quarterly():
    rows = [
        _row("2025Q1", rev=100.0, ni=10.0),
        _row("2026Q1", rev=120.0, ni=15.0),
        _row("2024FY", rev=400.0, ni=40.0),
    ]
    rg, eg = yoy_growth(rows)
    assert abs(rg - 0.20) < 1e-9
    assert abs(eg - 0.50) < 1e-9


def test_yoy_growth_annual_fallback():
    rows = [_row("2024FY", rev=100.0, ni=10.0), _row("2025FY", rev=110.0, ni=12.0)]
    rg, eg = yoy_growth(rows)
    assert abs(rg - 0.10) < 1e-9
    assert abs(eg - 0.20) < 1e-9


def test_yoy_growth_no_pair_or_bad_base():
    # 짝 없음 — 단일 연도만
    assert yoy_growth([_row("2024FY", rev=100.0)]) == (None, None)
    # 적자 기저(prev<=0) → 비율 무의미 → None
    rows = [
        _row("2024FY", rev=100.0, ni=-5.0),
        _row("2025FY", rev=110.0, ni=8.0),
    ]
    rg, eg = yoy_growth(rows)
    assert abs(rg - 0.10) < 1e-9
    assert eg is None
    # fs_type 이 다르면 짝 아님
    rows = [
        _row("2024FY", rev=100.0, fs="separate"),
        _row("2025FY", rev=110.0, fs="consolidated"),
    ]
    assert yoy_growth(rows) == (None, None)


def test_yoy_growth_prefers_latest_pair():
    rows = [
        _row("2023FY", rev=100.0, ni=10.0),
        _row("2024FY", rev=110.0, ni=11.0),
        _row("2025Q1", rev=30.0, ni=3.0),
        _row("2026Q1", rev=36.0, ni=3.6),
    ]
    rg, _eg = yoy_growth(rows)  # 2026Q1↔2025Q1 이 최신 짝
    assert abs(rg - 0.20) < 1e-9
