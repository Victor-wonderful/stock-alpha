"""시장 레짐·FRED 정규화·모닝 브리프 폴백 테스트 (네트워크 없음)."""
from __future__ import annotations

from engine.ingest.fred import normalize_observations
from engine.market.regime import compute_regime
from engine.reports.morning import fallback_brief


def test_regime_risk_on():
    rets = [0.12] * 7 + [0.05] * 2 + [-0.02]  # 평균 +9.3%, 상승 90%
    out = compute_regime(rets, foreign_net_5d=1e9)
    assert out["regime"] == "risk_on"
    assert out["score"] > 0.2
    assert any("20일" in d for d in out["drivers"])


def test_regime_risk_off():
    rets = [-0.15] * 8 + [0.01] * 2  # 평균 -11.8%, 상승 20%
    out = compute_regime(rets, foreign_net_5d=-1e9)
    assert out["regime"] == "risk_off"
    assert out["score"] < -0.2


def test_regime_neutral_without_flows():
    out = compute_regime([0.01, -0.01] * 10, foreign_net_5d=None)
    assert out["regime"] == "neutral"
    assert len(out["drivers"]) == 2  # 수급 축 제외


# ── 국면(market_state) — 방향 점수 1축 3구간 (2026-08-22 ER 축 제거) ──
def test_market_state_three_buckets():
    up = compute_regime([0.12] * 7 + [0.05] * 2 + [-0.02], 1e9)
    down = compute_regime([-0.15] * 8 + [0.01] * 2, -1e9)
    flat = compute_regime([0.01, -0.01] * 10, None)
    assert up["market_state"] == "uptrend"
    assert down["market_state"] == "downtrend"
    assert flat["market_state"] == "range"


def test_market_state_none_without_direction_inputs():
    # 방향 재료가 하나도 없으면 판정 보류 → 소비처의 구 risk_off 폴백이 산다.
    assert compute_regime([], None)["market_state"] is None


def test_regime_has_no_er_axis():
    # 축을 다시 들이지 않도록 못을 박는다 — 전환 국면·structure 는 없다.
    out = compute_regime([0.01, -0.01] * 10, None)
    assert "structure" not in out
    assert out["market_state"] != "transition"
    assert not any("ER" in d for d in out["drivers"])


def test_fred_normalize_skips_missing():
    obs = [
        {"date": "2026-06-09", "value": "17.5"},
        {"date": "2026-06-08", "value": "."},   # FRED 결측 표기
        {"date": "2026-06-07", "value": ""},
    ]
    rows = normalize_observations("VIXCLS", obs)
    assert len(rows) == 1
    assert rows[0] == {
        "series_id": "VIXCLS", "date": "2026-06-09",
        "value": 17.5, "source": "FRED",
    }


def test_morning_fallback_brief():
    ctx = {
        "as_of": "2026-06-11",
        "regime": {"regime": "risk_off", "score": -0.45,
                   "drivers": ["시장 20일 -21.8%"]},
        "macro": [],
        "picks": [{"name": "코오롱인더", "entry_price": 64100.0,
                   "stop_loss": 53765.0}],
        "rating_distribution": {"매수": 1},
    }
    b = fallback_brief(ctx)
    assert "위험회피" in b["headline"]
    assert isinstance(b["watchpoints"], list) and "코오롱인더" in b["watchpoints"][0]


def test_morning_fallback_empty_picks():
    b = fallback_brief({"regime": None, "picks": []})
    assert b["watchpoints"] == ["오늘 기준 통과 픽 없음 — 신규 진입 관망."]
