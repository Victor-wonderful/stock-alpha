"""자사주 매입 셋업 — 탐지 규칙 테스트.

근거는 실측이다(event_evidence): 공시 135건 · 한 달 +10.9% · 승률 81%.
차트 패턴 셋업들과 달리 이벤트 기반이라, 공시 데이터가 새거나 늦으면 조용히
안 터진다. 그 경계를 고정한다.
"""
import pandas as pd
import pytest

from engine.signals.playbooks import DISCLOSURE_SETUPS, detect_buyback


def _df(n=40, start="2026-06-01"):
    ts = pd.bdate_range(start, periods=n).strftime("%Y-%m-%d")
    close = [1000 + i * 5 for i in range(n)]
    return pd.DataFrame({
        "ts": ts, "open": close, "high": [c * 1.01 for c in close],
        "low": [c * 0.99 for c in close], "close": close, "volume": [10000] * n,
    })


def _discl(date: str, event_type: str = "buyback"):
    return pd.DataFrame([{"date": date, "event_type": event_type}])


class TestTrigger:
    def test_fires_right_after_disclosure(self):
        df = _df()
        last = df["ts"].iloc[-1]
        got = detect_buyback(df, _discl(last))
        assert got is not None
        assert got.setup == "buyback" and got.side == "buy"
        assert got.style == "position"

    def test_silent_without_disclosures(self):
        assert detect_buyback(_df(), None) is None
        assert detect_buyback(_df(), pd.DataFrame()) is None

    def test_other_event_types_ignored(self):
        """공급계약은 실측에서 한 달 -3.2% — 같은 공시라도 이걸로 사면 안 된다."""
        df = _df()
        got = detect_buyback(df, _discl(df["ts"].iloc[-1], "supply_contract"))
        assert got is None

    def test_stale_disclosure_expires(self):
        df = _df()
        old = df["ts"].iloc[0]                 # 40영업일 전
        assert detect_buyback(df, _discl(old)) is None

    def test_within_age_window(self):
        df = _df()
        recent = df["ts"].iloc[-3]
        assert detect_buyback(df, _discl(recent)) is not None

    def test_future_disclosure_not_used(self):
        """미래 공시가 과거 봉에 새면 룩어헤드다."""
        df = _df()
        assert detect_buyback(df, _discl("2099-01-01")) is None

    def test_short_history_skipped(self):
        df = _df(n=10)
        assert detect_buyback(df, _discl(df["ts"].iloc[-1])) is None

    def test_halted_zero_price_guarded(self):
        df = _df()
        df.loc[df.index[-1], "close"] = 0.0
        assert detect_buyback(df, _discl(df["ts"].iloc[-1])) is None


class TestStrength:
    def test_fresher_disclosure_is_stronger(self):
        df = _df()
        fresh = detect_buyback(df, _discl(df["ts"].iloc[-1]))
        older = detect_buyback(df, _discl(df["ts"].iloc[-4]))
        assert fresh.strength > older.strength

    def test_payload_records_disclosure_date(self):
        df = _df()
        d = df["ts"].iloc[-2]
        got = detect_buyback(df, _discl(d))
        assert got.payload["disclosed_at"] == d


class TestRegistration:
    def test_listed_as_disclosure_setup(self):
        """이 목록을 안 고치면 시그널·백테스트가 공시를 안 넘겨 조용히 미발동된다."""
        assert "buyback" in DISCLOSURE_SETUPS

    def test_registered_in_detectors_and_styles(self):
        from engine.signals.playbooks import ALL_DETECTORS, ALLOWED_STYLES
        assert ALL_DETECTORS["buyback"] is detect_buyback
        assert ALLOWED_STYLES["buyback"] == ("position",)
