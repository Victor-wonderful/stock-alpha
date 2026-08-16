"""시장 캘린더 — 순수 함수 테스트.

캘린더가 틀리면 조용히 틀린다. 만기일이 하루 밀리면 억제가 엉뚱한 날에 걸리고,
휴장일을 놓치면 다시 휴장일에 '장전 플랜'이 뜬다. 둘 다 예외가 안 나므로 고정
케이스로 방어한다.
"""
from datetime import date

import pytest

from engine.ingest.calendar_seed import seed_rows, traded_dates
from engine.market import calendar as cal

# 2026-08 한국 휴장: 8/15 광복절은 토요일이라 평일 휴장이 아니다.
# 평일 휴장 예: 2026-01-01(목) 신정.
HOL = {date(2026, 1, 1), date(2026, 3, 2), date(2026, 5, 5)}


class TestTradingDay:
    def test_weekend_is_not_trading_day(self):
        assert not cal.is_trading_day(date(2026, 8, 15), HOL)   # 토
        assert not cal.is_trading_day(date(2026, 8, 16), HOL)   # 일

    def test_holiday_is_not_trading_day(self):
        assert not cal.is_trading_day(date(2026, 1, 1), HOL)

    def test_plain_weekday_is_trading_day(self):
        assert cal.is_trading_day(date(2026, 8, 17), HOL)

    def test_next_trading_day_skips_weekend(self):
        # 금(8/14) 다음 거래일은 월(8/17)
        assert cal.next_trading_day(date(2026, 8, 14), HOL) == date(2026, 8, 17)

    def test_next_trading_day_skips_holiday(self):
        # 2025-12-31(수) 다음은 1/1(목) 휴장 → 1/2(금)
        assert cal.next_trading_day(date(2025, 12, 31), HOL) == date(2026, 1, 2)

    def test_include_self(self):
        d = date(2026, 8, 17)
        assert cal.next_trading_day(d, HOL, include_self=True) == d
        assert cal.next_trading_day(d, HOL) == date(2026, 8, 18)

    def test_prev_trading_day(self):
        assert cal.prev_trading_day(date(2026, 8, 17), HOL) == date(2026, 8, 14)

    def test_empty_holidays_still_skips_weekend(self):
        """휴장일 데이터가 없어도 최소한 주말은 건너뛴다(graceful)."""
        assert cal.next_trading_day(date(2026, 8, 14), set()) == date(2026, 8, 17)


class TestHolidayBackfill:
    def test_weekday_without_bar_is_holiday(self):
        traded = {date(2026, 8, 17), date(2026, 8, 19), date(2026, 8, 20)}
        got = cal.holidays_from_trading_days(traded, date(2026, 8, 17),
                                             date(2026, 8, 20))
        assert got == [date(2026, 8, 18)]

    def test_weekend_is_not_reported_as_holiday(self):
        traded = {date(2026, 8, 14), date(2026, 8, 17)}
        got = cal.holidays_from_trading_days(traded, date(2026, 8, 14),
                                             date(2026, 8, 17))
        assert got == []

    def test_empty_input_yields_nothing(self):
        """수집이 실패했을 때 온 세상을 휴장으로 만들면 안 된다."""
        assert cal.holidays_from_trading_days(set(), date(2026, 1, 1),
                                              date(2026, 12, 31)) == []


class TestNthWeekday:
    @pytest.mark.parametrize("year,month,expected", [
        (2026, 1, date(2026, 1, 8)),
        (2026, 3, date(2026, 3, 12)),
        (2026, 9, date(2026, 9, 10)),
        (2026, 12, date(2026, 12, 10)),
    ])
    def test_second_thursday(self, year, month, expected):
        got = cal.nth_weekday(year, month, cal.THU, 2)
        assert got == expected
        assert got.weekday() == cal.THU

    def test_first_friday(self):
        assert cal.nth_weekday(2026, 8, cal.FRI, 1) == date(2026, 8, 7)


class TestExpiry:
    def test_twelve_per_year(self):
        assert len(cal.expiry_events(2026, set())) == 12

    def test_quad_months_labelled(self):
        by_month = {e["date"].month: e for e in cal.expiry_events(2026, set())}
        for m in (3, 6, 9, 12):
            assert "동시만기" in by_month[m]["title"]
            assert by_month[m]["severity"] == 2

    def test_no_expiry_blocks_entry(self):
        """실측(442거래일)에서 만기일은 평소보다 조용했다 — 근거 없는 차단은 안 한다."""
        assert all(not e["block_entry"] for e in cal.expiry_events(2026, set()))

    def test_holiday_pulls_expiry_earlier(self):
        """만기일이 휴장이면 직전 거래일로 당겨진다."""
        second_thu = date(2026, 9, 10)
        events = cal.expiry_events(2026, {second_thu})
        sep = next(e for e in events if e["date"].month == 9)
        assert sep["date"] == date(2026, 9, 9)

    def test_event_key_is_deterministic(self):
        a = cal.expiry_events(2026, set())
        b = cal.expiry_events(2026, set())
        assert [e["event_key"] for e in a] == [e["event_key"] for e in b]


class TestIndexRebalance:
    def test_effective_day_after_quad_expiry(self):
        events = cal.index_rebalance_events(2026, set())
        jun = next(e for e in events if e["date"].month == 6)
        # 6월 두번째 목요일 = 6/11 → 다음 거래일 6/12(금)
        assert jun["date"] == date(2026, 6, 12)
        assert jun["block_entry"] is False   # 종목 단위 영향 — 시장 전체를 막지 않는다


class TestBlockingEvents:
    def _ev(self, d, *, block=True, lead=0):
        return {"date": d, "block_entry": block, "block_days_before": lead,
                "title": "t", "kind": "expiry"}

    def test_blocks_on_the_day(self):
        ev = self._ev(date(2026, 9, 10))
        assert cal.blocking_events(date(2026, 9, 10), [ev]) == [ev]

    def test_does_not_block_before_without_lead(self):
        ev = self._ev(date(2026, 9, 10))
        assert cal.blocking_events(date(2026, 9, 9), [ev]) == []

    def test_lead_days_block_earlier(self):
        ev = self._ev(date(2026, 9, 10), lead=3)
        assert cal.blocking_events(date(2026, 9, 8), [ev]) == [ev]
        assert cal.blocking_events(date(2026, 9, 6), [ev]) == []

    def test_does_not_block_after(self):
        ev = self._ev(date(2026, 9, 10), lead=3)
        assert cal.blocking_events(date(2026, 9, 11), [ev]) == []

    def test_non_blocking_event_ignored(self):
        ev = self._ev(date(2026, 9, 10), block=False)
        assert cal.blocking_events(date(2026, 9, 10), [ev]) == []

    def test_lead_is_capped(self):
        """시드 실수로 픽이 영영 0건이 되는 걸 막는 안전핀."""
        ev = self._ev(date(2026, 9, 10), lead=999)
        assert cal.blocking_events(date(2026, 9, 10 - 6), [ev]) == []
        assert cal.blocking_events(date(2026, 9, 10 - 5), [ev]) == [ev]

    def test_string_dates_from_db_are_accepted(self):
        ev = {"date": "2026-09-10", "block_entry": True, "block_days_before": 0}
        assert cal.blocking_events(date(2026, 9, 10), [ev]) == [ev]


class TestUpcoming:
    EVENTS = [
        {"date": "2026-08-20", "kind": "expiry", "title": "동시만기", "severity": 3},
        {"date": "2026-08-17", "kind": "macro_release", "title": "NFP", "severity": 2},
        {"date": "2026-08-30", "kind": "expiry", "title": "먼 것", "severity": 1},
        {"date": "2026-08-18", "kind": "holiday", "title": "휴장", "severity": 1},
        {"date": "2026-08-19", "kind": "earnings", "title": "실적", "severity": 3,
         "instrument_id": 42},
    ]

    def test_sorted_by_date_within_window(self):
        got = cal.upcoming(date(2026, 8, 17), self.EVENTS, days=7)
        assert [e["title"] for e in got] == ["NFP", "동시만기"]

    def test_holiday_excluded(self):
        got = cal.upcoming(date(2026, 8, 17), self.EVENTS, days=7)
        assert all(e["kind"] != "holiday" for e in got)

    def test_d_day_computed(self):
        got = cal.upcoming(date(2026, 8, 17), self.EVENTS, days=7)
        assert got[0]["d_day"] == 0
        assert got[1]["d_day"] == 3

    def test_instrument_event_only_for_that_instrument(self):
        assert all(e["title"] != "실적"
                   for e in cal.upcoming(date(2026, 8, 17), self.EVENTS, days=7))
        got = cal.upcoming(date(2026, 8, 17), self.EVENTS, days=7, instrument_id=42)
        assert any(e["title"] == "실적" for e in got)


class TestSeedFile:
    def test_valid_row(self):
        rows = seed_rows({"events": [{
            "date": "2026-08-27", "kind": "rate_decision", "title": "금통위",
            "severity": 3, "block_entry": True, "block_days_before": 1,
        }]})
        assert len(rows) == 1
        assert rows[0]["date"] == "2026-08-27"
        assert rows[0]["block_days_before"] == 1
        assert rows[0]["event_key"].startswith("seed-rate_decision-2026-08-27-")

    def test_event_key_stable_across_reorder(self):
        a = {"date": "2026-08-27", "kind": "rate_decision", "title": "금통위"}
        b = {"date": "2026-08-27", "kind": "rate_decision", "title": "다른 회의"}
        first = seed_rows({"events": [a, b]})
        second = seed_rows({"events": [b, a]})
        assert {r["event_key"] for r in first} == {r["event_key"] for r in second}
        assert len({r["event_key"] for r in first}) == 2

    def test_incomplete_rows_dropped(self):
        rows = seed_rows({"events": [
            {"date": "2026-08-27", "title": "종류 없음"},
            {"kind": "rate_decision", "title": "날짜 없음"},
            {"date": "not-a-date", "kind": "rate_decision", "title": "이상한 날짜"},
        ]})
        assert rows == []

    def test_block_days_capped_at_source(self):
        rows = seed_rows({"events": [{
            "date": "2026-08-27", "kind": "rate_decision", "title": "금통위",
            "block_days_before": 99,
        }]})
        assert rows[0]["block_days_before"] == cal.MAX_BLOCK_DAYS

    def test_empty_file(self):
        assert seed_rows({}) == []


class TestTradedDates:
    def test_empty_frame(self):
        import pandas as pd
        assert traded_dates(pd.DataFrame()) == set()
        assert traded_dates(None) == set()

    def test_index_becomes_dates(self):
        import pandas as pd
        df = pd.DataFrame({"종가": [1, 2]},
                          index=pd.to_datetime(["2026-08-17", "2026-08-18"]))
        assert traded_dates(df) == {date(2026, 8, 17), date(2026, 8, 18)}


class TestHolidayInferenceGuards:
    """데이터 없음 vs 장 쉼 — 이걸 헷갈리면 없는 휴장일을 만들어낸다."""

    def _weekdays(self, start: date, end: date) -> list[date]:
        from datetime import timedelta
        out, cur = [], start
        while cur <= end:
            if cur.weekday() < 5:
                out.append(cur)
            cur += timedelta(days=1)
        return out

    def test_range_clamped_to_available_data(self):
        """적재 이전 과거를 통째로 휴장으로 만들지 않는다."""
        traded = set(self._weekdays(date(2026, 3, 1), date(2026, 3, 31)))
        got = cal.holidays_from_trading_days(traded, date(2026, 1, 1), date(2026, 3, 31))
        assert got == []          # 1~2월은 데이터가 없을 뿐 휴장이 아니다

    def test_sparse_month_is_not_treated_as_holidays(self):
        """며칠만 적재된 달을 '연휴'로 읽지 않는다."""
        days = self._weekdays(date(2026, 3, 1), date(2026, 3, 31))
        traded = set(days[:5] + days[-1:])   # 22 평일 중 6일만
        got = cal.holidays_from_trading_days(traded, date(2026, 3, 1), date(2026, 3, 31))
        assert got == []

    def test_dense_month_still_reports_real_holidays(self):
        """정상 적재된 달에선 진짜 휴장일이 잡힌다."""
        days = self._weekdays(date(2026, 3, 1), date(2026, 3, 31))
        missing = days[7]
        traded = set(days) - {missing}
        got = cal.holidays_from_trading_days(traded, date(2026, 3, 1), date(2026, 3, 31))
        assert got == [missing]

    def test_realistic_year_holiday_count(self):
        """한국의 평일 휴장은 연 10~15일 — 자릿수가 틀리면 역산이 깨진 것이다."""
        days = self._weekdays(date(2026, 1, 1), date(2026, 12, 31))
        holidays = {days[i] for i in range(5, len(days), 22)}   # 달마다 1일꼴
        traded = set(days) - holidays
        got = cal.holidays_from_trading_days(traded, date(2026, 1, 1), date(2026, 12, 31))
        assert set(got) == holidays
        assert len(got) < 20


class TestNotHolidayOverride:
    """역산이 틀렸을 때 사람이 바로잡을 구멍 — 없으면 틀린 휴장일이 영구히 남는다."""

    def test_parses_dates(self):
        from engine.ingest.calendar_seed import not_holidays
        assert not_holidays({"not_holidays": ["2026-07-08", "2026-07-09"]}) == {
            date(2026, 7, 8), date(2026, 7, 9),
        }

    def test_absent_key(self):
        from engine.ingest.calendar_seed import not_holidays
        assert not_holidays({}) == set()

    def test_bad_value_dropped(self):
        from engine.ingest.calendar_seed import not_holidays
        assert not_holidays({"not_holidays": ["nope", "2026-07-08"]}) == {
            date(2026, 7, 8),
        }


class TestSeedHolidays:
    """미래 휴장일은 역산으로 알 수 없다 — 사람이 넣고, 기한을 선언해야 단정한다."""

    def test_parses_and_sorts(self):
        from engine.ingest.calendar_seed import seed_holidays
        days, through = seed_holidays({
            "holidays": ["2026-09-24", "2026-08-17"],
            "holidays_confirmed_through": "2026-12-31",
        })
        assert days == [date(2026, 8, 17), date(2026, 9, 24)]
        assert through == date(2026, 12, 31)

    def test_missing_through_is_none(self):
        from engine.ingest.calendar_seed import seed_holidays
        days, through = seed_holidays({"holidays": ["2026-08-17"]})
        assert days == [date(2026, 8, 17)]
        assert through is None

    def test_empty_payload(self):
        from engine.ingest.calendar_seed import seed_holidays
        assert seed_holidays({}) == ([], None)

    def test_null_through_is_none(self):
        from engine.ingest.calendar_seed import seed_holidays
        _, through = seed_holidays({"holidays_confirmed_through": None})
        assert through is None

    def test_bad_dates_dropped(self):
        from engine.ingest.calendar_seed import seed_holidays
        days, _ = seed_holidays({"holidays": ["2026-08-17", "언젠가"]})
        assert days == [date(2026, 8, 17)]


class TestCalendarImpact:
    """측정값은 화면에 '근거'로 나간다 — 표본이 얇으면 내보내지 않는 게 정직하다."""

    def _daily(self, n=40):
        from datetime import timedelta
        out, d = {}, date(2026, 1, 5)
        for i in range(n):
            while d.weekday() >= 5:
                d += timedelta(days=1)
            out[d] = {"dispersion": 0.04, "range": 0.039, "ret": 0.001}
            d += timedelta(days=1)
        return out

    def test_returns_none_below_min_sample(self):
        from engine.market import calendar_impact as ci
        daily = self._daily()
        evs = [{"date": d} for d in list(daily)[:2]]
        assert ci.measure(daily, evs, "expiry", "KR") is None

    def test_measures_when_sample_sufficient(self):
        from engine.market import calendar_impact as ci
        daily = self._daily()
        picked = list(daily)[:8]
        for d in picked:
            daily[d] = {"dispersion": 0.03, "range": 0.037, "ret": 0.005}
        got = ci.measure(daily, [{"date": d} for d in picked], "expiry", "KR")
        assert got["n"] == 8
        assert got["dispersion"] == pytest.approx(0.03)
        assert got["base_dispersion"] < 0.04      # 이벤트일이 섞여 평균이 내려간다
        assert got["offset_days"] == 0

    def test_macro_release_observed_next_trading_day(self):
        """밤사이 발표는 당일이 아니라 다음 거래일에 반영된다."""
        from engine.market import calendar_impact as ci
        daily = self._daily()
        days = sorted(daily)
        evs = [{"date": d} for d in days[:8]]
        got = ci.measure(daily, evs, "macro_release", "US")
        assert got["offset_days"] == 1

    def test_shift_skips_non_trading_day(self):
        from engine.market import calendar_impact as ci
        days = [date(2026, 8, 17), date(2026, 8, 18)]
        assert ci.shift_to_trading_day(date(2026, 8, 15), days, 0) is None   # 휴장
        assert ci.shift_to_trading_day(date(2026, 8, 15), days, 1) == date(2026, 8, 17)

    def test_string_dates_accepted(self):
        from engine.market import calendar_impact as ci
        daily = self._daily()
        picked = list(daily)[:8]
        got = ci.measure(daily, [{"date": d.isoformat()} for d in picked], "expiry", "KR")
        assert got["n"] == 8
