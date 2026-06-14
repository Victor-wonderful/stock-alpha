"""공시 분류 순수 함수 검증."""
from __future__ import annotations

from engine.ingest.disclosure_class import classify_disclosure, is_event


def test_positive_events():
    assert classify_disclosure("주요사항보고서(자기주식취득결정)") == ("buyback", "positive")
    assert classify_disclosure("주요사항보고서(자기주식소각결정)") == ("buyback_cancel", "positive")
    assert classify_disclosure("단일판매ㆍ공급계약체결") == ("supply_contract", "positive")
    assert classify_disclosure("무상증자결정") == ("bonus_issue", "positive")


def test_negative_events():
    assert classify_disclosure("주요사항보고서(유상증자결정)") == ("rights_offering", "negative")
    assert classify_disclosure("주요사항보고서(전환사채권발행결정)") == ("convertible_bond", "negative")
    assert classify_disclosure("횡령ㆍ배임혐의발생") == ("embezzlement", "negative")
    assert classify_disclosure("감자결정") == ("capital_reduction", "negative")


def test_neutral_and_other():
    assert classify_disclosure("최대주주변경") == ("control_change", "neutral")
    assert classify_disclosure("회사합병결정") == ("merger_split", "neutral")
    # 정기/미분류 → other
    assert classify_disclosure("사업보고서 (2025.12)") == ("other", "neutral")
    assert classify_disclosure("분기보고서 (2026.03)") == ("other", "neutral")
    assert classify_disclosure("주식등의대량보유상황보고서") == ("other", "neutral")
    assert classify_disclosure(None) == ("other", "neutral")


def test_is_event():
    assert is_event("주요사항보고서(자기주식취득결정)") is True
    assert is_event("분기보고서 (2026.03)") is False


def test_specific_before_generic():
    # 소각이 취득보다 먼저 매치돼야(둘 다 '자기주식' 포함)
    assert classify_disclosure("자기주식소각결정")[0] == "buyback_cancel"
    assert classify_disclosure("자기주식취득결정")[0] == "buyback"
