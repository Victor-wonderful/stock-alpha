"""DART 공시 분류 — report_nm(보고서명) → 이벤트 타입 + 기대 방향 (순수 함수).

이벤트 드리븐 알파의 1차 분류. 여기서 '방향(positive/negative)'은 **가설**일 뿐이며,
실제 발행은 이벤트 스터디(CAR·비용반영 게이트) 통과 타입만 한다(efficient market —
대부분 즉시 반영, 드리프트 있는 타입만 살아남음).

정기/일상 공시(사업·분기보고서, 대량보유, 감사보고서 등)는 event_type='other' 로
분류해 이벤트 피드에서 제외한다.
"""
from __future__ import annotations

# (키워드들 …) → (event_type, direction). 위에서부터 첫 매치. 구체 → 일반 순서.
# 모든 키워드가 report_nm(공백 제거)에 포함돼야 매치.
_RULES: list[tuple[tuple[str, ...], str, str]] = [
    (("자기주식", "소각"), "buyback_cancel", "positive"),
    (("자기주식", "취득"), "buyback", "positive"),
    (("자기주식취득신탁",), "buyback_trust", "positive"),
    (("무상증자",), "bonus_issue", "positive"),
    (("유상증자",), "rights_offering", "negative"),
    (("전환사채",), "convertible_bond", "negative"),
    (("신주인수권부사채",), "bond_with_warrant", "negative"),
    (("교환사채",), "exchangeable_bond", "negative"),
    (("단일판매", "공급계약"), "supply_contract", "positive"),
    (("공급계약체결",), "supply_contract", "positive"),
    (("감자",), "capital_reduction", "negative"),
    (("횡령",), "embezzlement", "negative"),
    (("배임",), "embezzlement", "negative"),
    (("회생절차",), "distress", "negative"),
    (("파산",), "distress", "negative"),
    (("부도",), "distress", "negative"),
    (("상장폐지",), "delisting_risk", "negative"),
    (("관리종목",), "delisting_risk", "negative"),
    (("거래정지",), "trading_halt", "negative"),
    (("현금", "현물", "배당"), "dividend", "positive"),
    (("주식배당",), "dividend", "positive"),
    (("최대주주변경",), "control_change", "neutral"),
    (("경영권", "양수도"), "control_change", "neutral"),
    (("합병",), "merger_split", "neutral"),
    (("분할",), "merger_split", "neutral"),
    (("액면분할",), "stock_split", "neutral"),
    (("주식분할",), "stock_split", "neutral"),
    (("타법인", "주식", "취득"), "equity_invest", "neutral"),
    (("유형자산", "양수"), "asset_acquire", "neutral"),
    (("유형자산", "양도"), "asset_dispose", "neutral"),
    (("특허권",), "patent", "positive"),
    (("조회공시", "시황"), "unusual_inquiry", "neutral"),
    (("풍문", "보도"), "unusual_inquiry", "neutral"),
]


def classify_disclosure(report_nm: str | None) -> tuple[str, str]:
    """보고서명 → (event_type, direction). 미분류/정기 공시는 ('other','neutral')."""
    if not report_nm:
        return ("other", "neutral")
    name = report_nm.replace(" ", "").replace("ㆍ", "").replace("·", "")
    for keywords, etype, direction in _RULES:
        if all(k.replace(" ", "") in name for k in keywords):
            return (etype, direction)
    return ("other", "neutral")


def is_event(report_nm: str | None) -> bool:
    """이벤트 피드 대상 여부(정기/미분류 제외)."""
    return classify_disclosure(report_nm)[0] != "other"
