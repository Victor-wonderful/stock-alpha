"""일일 발행 규정 v1 순수 함수 테스트 — 픽 선정·변동분 스킵·EOD 스타일 필터."""
from __future__ import annotations

from datetime import date

import pytest

from engine.reports.context import EOD_STYLES, build_plan
from engine.reports.daily import (
    PICK_EXPIRE_DAYS,
    PICKS_MIN_SCORE,
    resolve_pick_status,
    select_picks,
)
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


def test_picks_exclude_non_eod_plan():
    # 옛 payload(데이/종가베팅 플랜)가 섞여 있어도 픽으로 새지 않는다(이중 방어).
    r = _report(1, "매수", 70.0)
    r["payload"]["plan"] = [{"style": "day", "setup": "close_betting",
                             "strength": 0.9, "entry_price": 50.0,
                             "tp1": 55.0, "stop_loss": 48.0}]
    assert select_picks([r]) == []


def test_picks_empty_day_allowed():
    reports = [_report(1, "관망", 30.0), _report(2, "거래 부적합", 80.0, tradable=False)]
    assert select_picks(reports) == []


def test_picks_capped():
    reports = [_report(i, "매수", 65.0 + i) for i in range(10)]
    picks = select_picks(reports, max_picks=5)
    assert len(picks) == 5
    assert picks[0]["instrument_id"] == 9  # 최고 점수 우선


def test_picks_gate_filters_failing_combo():
    # 픽 플랜은 (breakout, swing). 게이트가 breakout 을 position 으로만 통과시키면
    # 엣지 미검증 swing 플랜은 발행되지 않는다(빈 날 허용).
    reports = [_report(1, "매수", 70.0)]
    assert select_picks(reports, passed_combos={"breakout": ["position"]}) == []
    # 같은 (setup,style) 이 통과면 발행되고, 실제 셋업 라벨이 실린다.
    picks = select_picks(reports, passed_combos={"breakout": ["swing"]})
    assert [p["instrument_id"] for p in picks] == [1]
    assert picks[0]["setup"] == "breakout"


def test_picks_exclude_factor_composite():
    # factor_composite 는 픽에서 제외(시그널/리포트로는 유지). 단독이면 픽 없음.
    r = _report(1, "매수", 80.0)
    r["payload"]["plan"] = [{"style": "position", "setup": "factor_composite",
                             "strength": 0.9, "entry_price": 100.0,
                             "tp1": 120.0, "stop_loss": 95.0}]
    assert select_picks([r], passed_combos={"factor_composite": ["position"]}) == []
    # 같은 종목이 다른 통과 셋업으로도 잡히면 그 셋업으로 선정된다.
    r["payload"]["plan"].append({"style": "swing", "setup": "breakout",
                                 "strength": 0.7, "entry_price": 100.0,
                                 "tp1": 118.0, "stop_loss": 96.0})
    picks = select_picks([r], passed_combos={"factor_composite": ["position"],
                                             "breakout": ["swing"]})
    assert [p["setup"] for p in picks] == ["breakout"]


def test_picks_regime_suppresses_trend_in_risk_off():
    # risk_off 국면 — 추세·돌파 셋업(leader_trend)은 픽에서 억제(빈 날 허용).
    r = _report(1, "매수", 80.0)
    r["payload"]["plan"] = [{"style": "position", "setup": "leader_trend",
                             "strength": 0.9, "entry_price": 100.0,
                             "tp1": 120.0, "stop_loss": 95.0}]
    passed = {"leader_trend": ["position"]}
    assert select_picks([r], passed_combos=passed, regime="risk_off") == []
    # neutral/None 국면이면 정상 선정.
    assert len(select_picks([r], passed_combos=passed, regime="neutral")) == 1
    assert len(select_picks([r], passed_combos=passed)) == 1


def test_picks_regime_keeps_flow_in_risk_off():
    # 수급 매집(flow_accumulation)은 추세추종이 아니라 risk_off 에서도 허용.
    r = _report(1, "매수", 80.0)
    r["payload"]["plan"] = [{"style": "position", "setup": "flow_accumulation",
                             "strength": 0.8, "entry_price": 100.0,
                             "tp1": 120.0, "stop_loss": 95.0}]
    picks = select_picks([r], passed_combos={"flow_accumulation": ["position"]},
                         regime="risk_off")
    assert [p["setup"] for p in picks] == ["flow_accumulation"]


def test_picks_style_chosen_by_expectancy():
    # 한 종목이 swing·position 둘 다 통과 → 강도가 아닌 검증 기대값 높은 쪽 선택.
    r = _report(1, "매수", 70.0)
    r["payload"]["plan"] = [
        {"style": "swing", "setup": "breakout", "strength": 0.9,   # 강도는 더 높지만
         "entry_price": 100.0, "tp1": 120.0, "stop_loss": 95.0},
        {"style": "position", "setup": "breakout", "strength": 0.6,  # 기대값이 더 높음
         "entry_price": 100.0, "tp1": 130.0, "stop_loss": 90.0},
    ]
    passed = {"breakout": ["swing", "position"]}
    exp = {("breakout", "swing"): 0.01, ("breakout", "position"): 0.12}
    picks = select_picks([r], passed_combos=passed, expectancy_by_combo=exp)
    assert picks[0]["style"] == "position"   # 강도(swing 0.9) 무시, 기대값 우선
    # 기대값 미주입 시엔 강도 폴백(swing 0.9) — 하위호환.
    picks_fallback = select_picks([r], passed_combos=passed)
    assert picks_fallback[0]["style"] == "swing"


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


# ── 픽 수명주기 ─────────────────────────────────────────────────────

def _bar(low: float, high: float, close: float | None = None) -> dict:
    """테스트용 일봉 한 개 — 종가 미지정 시 고가로 채움."""
    return {"low": low, "high": high, "close": high if close is None else close}


_PICK = {"as_of": "2026-06-10", "entry_price": 100.0,
         "target_price": 120.0, "stop_loss": 95.0}


def test_pick_status_level_fill_and_priority():
    today = date(2026, 6, 11)
    # 고가가 목표 도달 → 목표가(120) 레벨 체결 (종가 오버슈트 아님)
    out = resolve_pick_status(_PICK, [_bar(118, 121)], today)
    assert out["status"] == "target" and out["exit_price"] == 120.0
    assert out["close_return_pct"] == pytest.approx(0.20)
    # 저가가 손절 도달 → 손절가(95) 레벨 체결
    out = resolve_pick_status(_PICK, [_bar(94, 99)], today)
    assert out["status"] == "stopped" and out["exit_price"] == 95.0
    assert out["close_return_pct"] == pytest.approx(-0.05)
    # 같은 봉서 손절·목표 동시 → 손절 우선(보수적)
    assert resolve_pick_status(_PICK, [_bar(94, 121)], today)["status"] == "stopped"
    # 진행 중(미터치, 타임아웃 전) — 변경 없음
    assert resolve_pick_status(_PICK, [_bar(98, 105)], today) is None
    # 봉 없음 — 판정 보류
    assert resolve_pick_status(_PICK, [], today) is None
    assert resolve_pick_status(_PICK, None, today) is None


def test_pick_status_timeout_closes_at_close():
    # 스타일 미지정 → 기본 타임아웃 10봉. 미터치 10봉 → 마지막 봉 종가 청산.
    bars = [_bar(98, 108, 105.0) for _ in range(10)]
    out = resolve_pick_status(_PICK, bars, date(2026, 6, 30))
    assert out["status"] == "expired"
    assert out["exit_price"] == 105.0
    assert out["close_return_pct"] == pytest.approx(0.05)


def test_pick_status_style_timeout_position_longer():
    # position(60봉) 은 10봉으론 타임아웃 안 됨 → 아직 진행 중.
    pick = {**_PICK, "style": "position"}
    bars = [_bar(98, 108, 105.0) for _ in range(10)]
    assert resolve_pick_status(pick, bars, date(2026, 6, 30)) is None


def test_pick_status_calendar_safety_net():
    # 봉이 적어(거래정지) 봉-타임아웃 미도달이지만 캘린더 안전망 경과 → 강제 만료.
    far = date(2026, 6, 10) + __import__("datetime").timedelta(days=PICK_EXPIRE_DAYS)
    out = resolve_pick_status(_PICK, [_bar(98, 108, 103.0)], far)
    assert out["status"] == "expired" and out["exit_price"] == 103.0


# ── 분할익절(스케일아웃) 수명주기 (0022) ──
_SCALE = {"as_of": "2026-06-10", "entry_price": 100.0, "target_price": 110.0,
          "tp2_price": 120.0, "stop_loss": 95.0, "tp1_hit": False}


def test_scaleout_tp1_hit_is_non_closing():
    today = date(2026, 6, 11)
    # tp1(110) 고가 도달, tp2 미만 → 종결 아님: tp1_hit 표시 + 본전스톱 전환.
    out = resolve_pick_status(_SCALE, [_bar(105, 112)], today)
    assert out == {"tp1_hit": True, "tp1_hit_at": "2026-06-11"}
    assert "status" not in out


def test_scaleout_stop_before_tp1():
    out = resolve_pick_status(_SCALE, [_bar(94, 99)], date(2026, 6, 11))
    assert out["status"] == "stopped"
    assert out["exit_price"] == 95.0
    assert out["close_return_pct"] == pytest.approx(-0.05)  # 손절가 레벨 체결


def test_scaleout_breakeven_after_tp1_is_partial():
    # 이미 1차 익절한 픽이 본전(entry=100) 저가 터치 → 'partial', 블렌디드 0.5*0.10.
    pick = {**_SCALE, "tp1_hit": True}
    out = resolve_pick_status(pick, [_bar(99, 103)], date(2026, 6, 12))
    assert out["status"] == "partial"
    assert out["exit_price"] == 100.0
    assert out["close_return_pct"] == pytest.approx(0.05)


def test_scaleout_tp2_after_tp1_is_full_target():
    pick = {**_SCALE, "tp1_hit": True}
    out = resolve_pick_status(pick, [_bar(115, 121)], date(2026, 6, 12))
    assert out["status"] == "target" and out["exit_price"] == 120.0
    # 0.5*(110/100-1) + 0.5*(120/100-1) = 0.5*0.10 + 0.5*0.20 = 0.15
    assert out["close_return_pct"] == pytest.approx(0.15)


def test_scaleout_multi_bar_tp1_then_tp2():
    # 1봉서 tp1, 다음 봉서 tp2 — 봉 시퀀스 상태(tp1_hit) 유지 검증.
    bars = [_bar(105, 112), _bar(113, 121)]
    out = resolve_pick_status(_SCALE, bars, date(2026, 6, 12))
    assert out["status"] == "target"
    assert out["close_return_pct"] == pytest.approx(0.15)


def test_scaleout_same_bar_through_tp2():
    # tp1 미기록 봉서 고가가 tp2 초과 → 양 트랜치 실현(tp2 레벨 체결) + tp1_hit 기록.
    out = resolve_pick_status(_SCALE, [_bar(105, 125)], date(2026, 6, 11))
    assert out["status"] == "target" and out["tp1_hit"] is True
    assert out["exit_price"] == 120.0
    assert out["close_return_pct"] == pytest.approx(0.15)


def test_scaleout_legacy_pick_without_tp2_unchanged():
    # tp2 없는 옛 픽은 단일 청산 — 목표가(120) 레벨 체결(종가 오버슈트 아님).
    out = resolve_pick_status(_PICK, [_bar(118, 121)], date(2026, 6, 11))
    assert out["status"] == "target"
    assert out["exit_price"] == 120.0
    assert out["close_return_pct"] == pytest.approx(0.20)


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
