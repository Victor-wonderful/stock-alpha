"""일일 발행 규정 v1 순수 함수 테스트 — 픽 선정·변동분 스킵·EOD 스타일 필터."""
from __future__ import annotations

from datetime import date

from engine.reports.context import EOD_STYLES, build_plan
from engine.reports.daily import PICKS_MIN_SCORE, select_picks
from engine.reports.runner import should_skip_unchanged


def _report(iid: int, rating: str, score: float, *, tradable: bool = True,
            plan: bool = True, thesis: str = "t") -> dict:
    return {
        "instrument_id": iid,
        "as_of": "2026-06-10",
        "summary": thesis,
        "payload": {
            "verdict": {"rating": rating, "score": score},
            "tradability": {"passed": tradable},
            "plan": (
                [{"style": "swing", "setup": "breakout", "strength": 0.8,
                  "entry_price": 100.0, "tp1": 120.0, "stop_loss": 95.0}]
                if plan else []
            ),
            "narrative": {"thesis": thesis},
        },
    }


# ── 오늘의 포커스 선정 ────────────────────────────────────────────────

def test_picks_buy_and_high_score_only():
    reports = [
        _report(1, "매수", 67.0),
        _report(2, "중립", PICKS_MIN_SCORE + 1),   # 점수 상위 → 포함
        _report(3, "중립", PICKS_MIN_SCORE - 10),  # 미달 → 제외
        _report(4, "관망", 90.0, tradable=False),  # 게이트 미통과 → 제외
        _report(5, "매수", 70.0, plan=False),      # 플랜 없음 → 제외
    ]
    picks = select_picks(reports)
    # 점수순 정렬(매수 67 > 중립 61) + 미달/게이트탈락/플랜없음 제외
    assert [p["instrument_id"] for p in picks] == [1, 2]
    assert picks[0]["basket_type"] == "daily_focus"
    assert picks[0]["entry_price"] == 100.0
    assert picks[0]["target_price"] == 120.0
    assert picks[0]["stop_loss"] == 95.0
    assert 0 < picks[0]["conviction"] <= 1


def test_picks_empty_day_allowed():
    reports = [_report(1, "관망", 30.0), _report(2, "거래 부적합", 80.0, tradable=False)]
    assert select_picks(reports) == []


def test_picks_capped():
    reports = [_report(i, "매수", 65.0 + i) for i in range(10)]
    picks = select_picks(reports, max_picks=5)
    assert len(picks) == 5
    assert picks[0]["instrument_id"] == 9  # 최고 점수 우선


# ── 커버리지 트랙 변동분 스킵 ────────────────────────────────────────

def test_skip_unchanged():
    today = date(2026, 6, 10)
    prev = {"rating": "중립", "as_of": "2026-06-09"}
    assert should_skip_unchanged(prev, "중립", today, 3)          # 동일+최근 → 스킵
    assert not should_skip_unchanged(prev, "매수", today, 3)      # 판정 변경 → 발행
    old = {"rating": "중립", "as_of": "2026-06-01"}
    assert not should_skip_unchanged(old, "중립", today, 3)       # 오래됨 → 발행
    assert not should_skip_unchanged(None, "중립", today, 3)      # 기존 없음 → 발행
    assert not should_skip_unchanged(prev, "중립", today, 0)      # 비활성(액션 트랙)


# ── EOD 스타일 필터 ─────────────────────────────────────────────────

def test_plan_eod_styles_excludes_day():
    signals = [
        {"signal_type": "buy", "style": "swing", "setup": "breakout",
         "strength": 0.7, "entry_price": 100.0},
        {"signal_type": "buy", "style": "day", "setup": "close_betting",
         "strength": 0.9, "entry_price": 50.0},
    ]
    plan = build_plan(signals, styles=EOD_STYLES)
    assert len(plan) == 1 and plan[0]["style"] == "swing"
    assert len(build_plan(signals)) == 2  # 필터 없으면 전체
