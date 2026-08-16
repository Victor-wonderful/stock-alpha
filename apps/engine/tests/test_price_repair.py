"""과거 주가 재계산 — 탐지 규칙 테스트.

한국 주식은 하루 ±30% 를 못 넘는다. 그걸 넘는 값은 실제 거래가 아니라 기준 변경
(주식 병합·감자)이거나 데이터 오류다. 이 규칙이 무너지면 가짜 등락이 이벤트 성적표를
통째로 오염시킨다(감자 공시 한 달 수익률이 +230% 로 나왔던 사고).
"""
from engine.ingest.price_repair import LIMIT, impossible_moves


def test_normal_moves_ignored():
    rows = [(1, "2026-08-14", 0.29), (1, "2026-08-13", -0.30), (2, "2026-08-14", 0.0)]
    assert impossible_moves(rows) == {}


def test_tenfold_merge_detected():
    """544 -> 5,440 (10주를 1주로 합침) = +900%."""
    rows = [(58400, "2026-07-21", 9.0)]
    got = impossible_moves(rows)
    assert list(got) == [58400]
    assert got[58400][0]["ret"] == 9.0


def test_large_drop_detected():
    rows = [(1, "2026-06-01", -0.9)]
    assert 1 in impossible_moves(rows)


def test_groups_by_instrument():
    rows = [(1, "2026-06-01", 5.0), (1, "2026-07-01", -0.8), (2, "2026-06-01", 4.0)]
    got = impossible_moves(rows)
    assert len(got[1]) == 2 and len(got[2]) == 1


def test_none_returns_skipped():
    assert impossible_moves([(1, "2026-06-01", None)]) == {}


def test_threshold_leaves_headroom_over_limit():
    """가격제한폭 30% 를 살짝 넘는 값에 곧바로 재수집을 걸지 않는다."""
    assert LIMIT > 0.30
    assert impossible_moves([(1, "2026-06-01", 0.31)]) == {}


def test_custom_limit():
    assert impossible_moves([(1, "2026-06-01", 0.31)], limit=0.30) != {}
