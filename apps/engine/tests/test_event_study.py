"""이벤트 성적표 — 순수 함수 테스트.

이 표는 사용자에게 "이 뉴스 사도 되나"를 답하는 근거가 된다. 틀린 근거는 없는 근거보다
나쁘므로, 표본이 얕을 때 판정하지 않는 것과 기준 변경 구간을 빼는 것이 핵심이다.
"""
import pytest

from engine.market.event_study import (
    GOOD_WIN,
    MIN_SAMPLE,
    car_for_event,
    summarize,
    verdict_for,
)

DAYS = [f"2026-06-{d:02d}" for d in range(1, 26)]
MARKET = dict.fromkeys(DAYS, 0.001)


def _rets(**over):
    r = dict.fromkeys(DAYS, 0.001)
    r.update(over)
    return r


class TestCar:
    def test_entry_is_the_day_after(self):
        """공시 당일이 아니라 다음 거래일부터 — 접수 시각을 모르므로 보수적으로."""
        rets = _rets(**{"2026-06-10": 0.50, "2026-06-11": 0.02})
        got = car_for_event(rets, MARKET, DAYS, "2026-06-10", 1)
        assert got == pytest.approx(0.02 - 0.001)   # 당일 +50% 는 안 먹는다

    def test_market_move_is_subtracted(self):
        """시장이 통째로 오른 날 같이 오른 건 그 뉴스의 공로가 아니다."""
        rets = _rets(**{"2026-06-11": 0.03})
        market = dict(MARKET, **{"2026-06-11": 0.03})
        assert car_for_event(rets, market, DAYS, "2026-06-10", 1) == pytest.approx(0.0)

    def test_accumulates_over_window(self):
        rets = _rets(**{"2026-06-11": 0.01, "2026-06-12": 0.02})
        got = car_for_event(rets, dict.fromkeys(DAYS, 0.0), DAYS, "2026-06-10", 2)
        assert got == pytest.approx(0.03)

    def test_none_when_window_incomplete(self):
        assert car_for_event(_rets(), MARKET, DAYS, DAYS[-1], 5) is None

    def test_none_when_price_missing(self):
        rets = _rets()
        del rets["2026-06-11"]
        assert car_for_event(rets, MARKET, DAYS, "2026-06-10", 1) is None

    def test_capital_change_window_dropped(self):
        """감자·병합으로 주가 기준이 바뀐 구간은 '올랐다'고 셀 수 없다."""
        rets = _rets(**{"2026-06-12": 9.0})     # 10주를 1주로 합침
        assert car_for_event(rets, MARKET, DAYS, "2026-06-10", 5) is None

    def test_normal_limit_move_kept(self):
        """상한가(+30%)는 진짜 거래다 — 빼면 안 된다."""
        rets = _rets(**{"2026-06-11": 0.29})
        assert car_for_event(rets, MARKET, DAYS, "2026-06-10", 1) is not None


class TestVerdict:
    def test_insufficient_below_min_sample(self):
        assert verdict_for(MIN_SAMPLE - 1, 0.10, 0.90) == "insufficient"

    def test_good_needs_both_positive_and_win_rate(self):
        assert verdict_for(200, 0.08, GOOD_WIN) == "good"
        assert verdict_for(200, 0.08, 0.50) == "neutral"      # 올랐지만 승률 평범
        assert verdict_for(200, -0.01, 0.90) == "neutral"     # 승률 높지만 평균 음수

    def test_caution(self):
        assert verdict_for(693, -0.068, 0.35) == "caution"

    def test_missing_values_are_insufficient(self):
        assert verdict_for(200, None, 0.6) == "insufficient"
        assert verdict_for(200, 0.05, None) == "insufficient"


class TestSummarize:
    def test_counts_and_means(self):
        per = {i: [0.01, 0.02, 0.05] for i in range(60)}
        got = summarize(per, "disclosure", "buyback")
        assert got["n"] == 60
        assert got["car_20d"] == pytest.approx(0.05)
        assert got["win_20d"] == 1.0
        assert got["verdict"] == "good"

    def test_excluded_counted_not_averaged(self):
        per = {i: [0.01, 0.02, 0.05] for i in range(60)}
        per[99] = [None, None, None]
        got = summarize(per, "disclosure", "buyback")
        assert got["n"] == 60
        assert got["n_excluded"] == 1

    def test_cost_reduces_net(self):
        per = {i: [0.0, 0.0, 0.05] for i in range(60)}
        got = summarize(per, "disclosure", "x", cost=0.004)
        assert got["car_20d_net"] == pytest.approx(0.046)

    def test_median_reported_alongside_mean(self):
        """평균은 이상치 하나에 끌린다 — 중앙값을 같이 남긴다."""
        per = {i: [0.0, 0.0, 0.01] for i in range(59)}
        per[999] = [0.0, 0.0, 5.0]
        got = summarize(per, "disclosure", "x")
        assert got["median_20d"] == pytest.approx(0.01)
        assert got["car_20d"] > 0.05

    def test_empty_is_insufficient(self):
        got = summarize({}, "disclosure", "x")
        assert got["n"] == 0 and got["verdict"] == "insufficient"
