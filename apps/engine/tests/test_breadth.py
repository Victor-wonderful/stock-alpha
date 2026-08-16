"""시장 폭·조건부 실측 — 순수 함수 테스트 (DB 없이)."""
from __future__ import annotations

from engine.ingest.naver import normalize_world_index
from engine.market.breadth import (
    CONDITIONS,
    MIN_SAMPLE,
    MarketDay,
    baseline,
    measure,
)
from engine.reports.morning import _condition_sentence, fallback_brief


def _series(rets: list[float], breadths: list[float] | None = None) -> list[MarketDay]:
    bs = breadths or [0.5] * len(rets)
    return [
        MarketDay(f"2026-01-{i+1:02d}", r, b, int(b * 100), 100 - int(b * 100), 100)
        for i, (r, b) in enumerate(zip(rets, bs))
    ]


# ── 기준선 ────────────────────────────────────────────────────────────
def test_baseline_counts_up_days():
    # 3일 중 다음날이 오른 경우: i=0→+, i=1→-  ⇒ 1/2
    s = _series([0.01, 0.01, -0.01])
    b = baseline(s, horizons=(1,))
    assert b["n"] == 3
    assert b["up_rate_1d"] == 0.5


# ── 조건 판정 ─────────────────────────────────────────────────────────
def test_streak_condition_needs_full_run():
    s = _series([0.01, 0.01, 0.01, -0.01])
    up3 = CONDITIONS["3거래일 연속 상승"]
    assert up3(s, 2)          # 0,1,2 전부 상승
    assert not up3(s, 3)      # 마지막이 하락
    assert not up3(s, 1)      # 아직 3일 안 됨


def test_breadth_condition():
    s = _series([0.0] * 3, breadths=[0.75, 0.5, 0.2])
    hi = CONDITIONS["오른 종목이 70%를 넘음"]
    lo = CONDITIONS["내린 종목이 70%를 넘음"]
    assert hi(s, 0) and not hi(s, 1)
    assert lo(s, 2) and not lo(s, 1)


def test_trend_condition_needs_20_days():
    s = _series([0.01] * 25)          # 매일 +1% → 20일 누적 +22%
    up = CONDITIONS["20거래일 누적 +5% 초과"]
    assert not up(s, 10)              # 20봉 미만이면 판정 안 함
    assert up(s, 24)


# ── 표본 게이트 ───────────────────────────────────────────────────────
def test_measure_rejects_small_sample():
    # 조건 성립일이 MIN_SAMPLE 미만이면 발행하지 않는다(우연을 근거로 안 쓴다).
    s = _series([0.01] * 50)
    rare = lambda ser, i: i == 10          # noqa: E731 — 성립 1회
    assert measure(s, "희귀", rare) is None

    always = lambda ser, i: True           # noqa: E731
    m = measure(s, "항상", always)
    assert m is not None and m["n"] >= MIN_SAMPLE
    assert m["condition"] == "항상"


def test_measure_reports_sample_and_rate():
    s = _series([0.01] * 40 + [-0.01] * 40)
    m = measure(s, "전체", lambda ser, i: True, horizons=(1,))
    assert m["n"] >= MIN_SAMPLE
    assert 0.0 <= m["up_rate_1d"] <= 1.0


# ── 서술 — 기준선을 반드시 함께 ────────────────────────────────────────
def test_sentence_always_includes_baseline():
    c = {"condition": "3거래일 연속 상승", "n": 86, "up_rate_1d": 0.674}
    out = _condition_sentence(c, {"up_rate_1d": 0.553})
    assert "86회" in out          # 표본 수
    assert "67%" in out           # 조건부
    assert "55%" in out           # 기준선 — 이게 빠지면 실력으로 읽힌다
    assert "높습니다" in out


def test_sentence_calls_out_no_edge():
    # 기준선과 3%p 미만 차이는 '사실상 같다'고 말한다 — 없는 엣지를 있는 척 안 함.
    c = {"condition": "20거래일 누적 +5% 초과", "n": 93, "up_rate_1d": 0.576}
    out = _condition_sentence(c, {"up_rate_1d": 0.553})
    assert "사실상 같습니다" in out


# ── 폴백 브리프 ───────────────────────────────────────────────────────
def _ctx(market: dict | None) -> dict:
    return {"as_of": "2026-08-14", "regime": {"regime": "risk_on"},
            "market": market, "picks": [], "macro": []}


def test_fallback_uses_market_numbers():
    mk = {
        "market_ret": 0.0079, "breadth": 0.5723, "prev_breadth": 0.3433,
        "advancers": 1457, "decliners": 891, "lookback_days": 442,
        "baseline": {"up_rate_1d": 0.5533},
        "conditions": [{"condition": "3거래일 연속 상승", "n": 86, "up_rate_1d": 0.674}],
    }
    b = fallback_brief(_ctx(mk))
    assert "1,457" in b["headline"] and "891" in b["headline"]
    assert "86회" in b["market_view"] and "55%" in b["market_view"]


def test_fallback_says_nothing_special_when_no_condition():
    mk = {
        "market_ret": 0.001, "breadth": 0.51, "prev_breadth": 0.49,
        "advancers": 1300, "decliners": 1200, "lookback_days": 442,
        "baseline": {"up_rate_1d": 0.5533}, "conditions": [],
    }
    b = fallback_brief(_ctx(mk))
    assert "특이 조건이 없습니다" in b["market_view"]


# ── 해외지수 수집 (네이버) ────────────────────────────────────────────
def test_world_index_uses_local_trade_date():
    # localTradedAt 은 미국 현지시각 — 날짜만 뽑아야 '어젯밤 미국장'과 날짜가 맞는다.
    rows = normalize_world_index(
        [{"localTradedAt": "2026-08-14T16:15:00-04:00", "closePrice": "14.25"}],
        "VIX_NAVER",
    )
    assert rows == [
        {"series_id": "VIX_NAVER", "date": "2026-08-14",
         "value": 14.25, "source": "NAVER"}
    ]


def test_world_index_skips_broken_rows():
    rows = normalize_world_index(
        [
            {"localTradedAt": "", "closePrice": "14.25"},          # 날짜 결손
            {"localTradedAt": "2026-08-14T16:15:00-04:00"},        # 종가 결손
            {"localTradedAt": "2026-08-13T16:15:00-04:00", "closePrice": "14.63"},
        ],
        "VIX_NAVER",
    )
    assert len(rows) == 1 and rows[0]["date"] == "2026-08-13"


def test_fallback_degrades_without_market_data():
    # 직접 PG 불가 등으로 market 이 None 이어도 브리프는 나온다(graceful).
    b = fallback_brief(_ctx(None))
    assert b["headline"] and "레짐" in b["headline"]
