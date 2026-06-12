"""DART 재무 변환 검증 — OpenDART 응답 json → financials 행 (네트워크 없음)."""
from __future__ import annotations

from engine.ingest import dart


def test_parse_amount():
    assert dart._parse_amount("1,234,567") == 1234567.0
    assert dart._parse_amount("(1,000)") == -1000.0
    assert dart._parse_amount("") is None
    assert dart._parse_amount("-") is None
    assert dart._parse_amount(None) is None
    assert dart._parse_amount("500") == 500.0


def _sample_api():
    return {
        "status": "000",
        "list": [
            {"sj_div": "IS", "account_nm": "매출액", "thstrm_amount": "300,870,903"},
            {"sj_div": "IS", "account_nm": "영업이익", "thstrm_amount": "65,670,000"},
            {"sj_div": "IS", "account_nm": "당기순이익", "thstrm_amount": "55,000,000"},
            {"sj_div": "BS", "account_nm": "자산총계", "thstrm_amount": "455,000,000"},
            {"sj_div": "BS", "account_nm": "자본총계", "thstrm_amount": "363,000,000"},
            {"sj_div": "BS", "account_nm": "부채총계", "thstrm_amount": "92,000,000"},
            {"sj_div": "CF", "account_nm": "영업활동현금흐름", "thstrm_amount": "(10,000)"},
        ],
    }


def test_normalize_financials_maps_accounts():
    rows = dart.normalize_financials(
        _sample_api(), instrument_id=1, bsns_year="2024", reprt_code="11011", fs_div="CFS",
    )
    assert len(rows) == 1
    r = rows[0]
    assert r["instrument_id"] == 1
    assert r["period"] == "2024FY"
    assert r["fs_type"] == "consolidated"
    assert r["source"] == "DART"
    assert r["revenue"] == 300_870_903.0
    assert r["op_income"] == 65_670_000.0
    assert r["net_income"] == 55_000_000.0
    assert r["assets"] == 455_000_000.0
    assert r["equity"] == 363_000_000.0
    assert r["debt"] == 92_000_000.0
    assert r["ocf"] == -10_000.0


def test_normalize_financials_separate_fs():
    rows = dart.normalize_financials(
        _sample_api(), instrument_id=2, bsns_year="2024", reprt_code="11013", fs_div="OFS",
    )
    assert rows[0]["fs_type"] == "separate"
    assert rows[0]["period"] == "2024Q1"


def test_normalize_financials_empty_list():
    assert dart.normalize_financials({"list": []}, 1, "2024", "11011", "CFS") == []


def test_normalize_financials_no_relevant_accounts():
    api = {"list": [{"sj_div": "BS", "account_nm": "기타포괄손익", "thstrm_amount": "100"}]}
    # assets/revenue/op_income/net_income 없음 → 행 생성 안 함
    assert dart.normalize_financials(api, 1, "2024", "11011", "CFS") == []


# ── 일일 쿼터 가드 ──

def test_dart_quota_guard(tmp_path, monkeypatch):
    import pytest
    monkeypatch.setattr(dart, "_QUOTA_PATH", tmp_path / "q.json")
    monkeypatch.setattr(dart, "DART_DAILY_LIMIT", 3)
    dart._count_call()
    dart._count_call(2)
    assert dart.quota_used() == 3
    with pytest.raises(dart.DartQuotaError):
        dart._count_call()
    assert dart.quota_used() == 3  # 초과분은 기록되지 않음
