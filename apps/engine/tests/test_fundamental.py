"""펀더멘털/밸류에이션 검증 — ratios·dcf·relative (네트워크 없음)."""
from __future__ import annotations

import pytest

from engine.fundamental import dcf, relative
from engine.fundamental.ratios import compute_ratios
from engine.fundamental.runner import build_valuation_row


def test_compute_ratios_basic():
    fin = {
        "revenue": 1000.0, "op_income": 200.0, "net_income": 150.0,
        "equity": 1000.0, "debt": 500.0, "eps": 1500.0, "bps": 10000.0,
    }
    r = compute_ratios(fin, price=30000.0)
    assert r["roe"] == pytest.approx(0.15)
    assert r["op_margin"] == pytest.approx(0.20)
    assert r["net_margin"] == pytest.approx(0.15)
    assert r["debt_ratio"] == pytest.approx(0.5)
    assert r["per"] == pytest.approx(20.0)   # 30000/1500
    assert r["pbr"] == pytest.approx(3.0)    # 30000/10000


def test_compute_ratios_derives_eps_from_shares():
    fin = {"net_income": 1000.0, "equity": 5000.0}
    r = compute_ratios(fin, price=100.0, shares=100.0)
    # eps=10, bps=50 → per=10, pbr=2
    assert r["per"] == pytest.approx(10.0)
    assert r["pbr"] == pytest.approx(2.0)


def test_compute_ratios_safe_on_zero_denominator():
    r = compute_ratios({"net_income": 100.0, "equity": 0.0}, price=None)
    assert r["roe"] is None
    assert r["per"] is None


def test_ev_ebitda():
    fin = {}
    r = compute_ratios(fin, price=100.0, shares=10.0, ebitda=500.0, net_debt=200.0)
    # EV = 100*10 + 200 = 1200; EV/EBITDA = 1200/500 = 2.4
    assert r["ev_ebitda"] == pytest.approx(2.4)


def test_dcf_value_positive_and_components():
    res = dcf.dcf_value(fcf0=100.0, shares=10.0, wacc=0.10, growth=0.05, years=5,
                        terminal_growth=0.02, net_debt=0.0)
    assert res.intrinsic_per_share > 0
    assert res.enterprise_value == pytest.approx(res.pv_explicit + res.pv_terminal)
    assert res.equity_value == pytest.approx(res.enterprise_value)  # net_debt=0


def test_dcf_net_debt_reduces_equity():
    base = dcf.dcf_value(fcf0=100, shares=10, wacc=0.1, growth=0.05, net_debt=0)
    levered = dcf.dcf_value(fcf0=100, shares=10, wacc=0.1, growth=0.05, net_debt=500)
    assert levered.intrinsic_per_share < base.intrinsic_per_share


def test_dcf_invalid_wacc():
    with pytest.raises(ValueError):
        dcf.dcf_value(fcf0=100, shares=10, wacc=0.02, growth=0.05, terminal_growth=0.03)


def test_upside_pct():
    assert dcf.upside_pct(120.0, 100.0) == pytest.approx(0.2)
    assert dcf.upside_pct(None, 100.0) is None
    assert dcf.upside_pct(120.0, 0.0) is None


def test_peer_implied_price_median():
    # EPS 2000, peer PER [8,10,12] median=10 → 20000
    assert relative.peer_implied_price(metric_per_share=2000.0, peer_multiples=[8, 10, 12]) == 20000.0


def test_peer_implied_price_filters_invalid():
    assert relative.peer_implied_price(metric_per_share=1000.0, peer_multiples=[None, -5, 10]) == 10000.0
    assert relative.peer_implied_price(metric_per_share=None, peer_multiples=[10]) is None


def test_build_valuation_row_assembles():
    fin = {
        "revenue": 1000.0, "op_income": 200.0, "net_income": 150.0,
        "equity": 1000.0, "debt": 0.0, "eps": 1500.0, "bps": 10000.0,
        "fcf": 100.0, "shares": 10.0, "source": "DART",
    }
    row = build_valuation_row(7, fin, price=30000.0)
    assert row["instrument_id"] == 7
    assert row["per"] == pytest.approx(20.0)
    assert row["roe"] == pytest.approx(0.15)
    assert row["dcf_value"] is not None
    assert row["upside_pct"] is not None
    assert row["source_version"] == "valuation-v1"
