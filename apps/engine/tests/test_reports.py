"""리포트 모듈 순수 함수 테스트 — 컨텍스트 조립·게이트·판정·렌더·LLM 파싱."""
from __future__ import annotations

from engine.reports.context import (
    ATR_PCT_CEILING,
    TURNOVER_FLOOR_KRW,
    atr_pct,
    avg_turnover_krw,
    backtest_passed,
    build_context,
    build_plan,
    build_tradability,
    build_verdict,
)
from engine.reports.llm import parse_narrative
from engine.reports.render import DISCLAIMER, fallback_narrative, render_body_md

# ── 픽스처 ──────────────────────────────────────────────────────────

OHLCV = [
    {"ts": f"2026-06-{d:02d}", "open": 103, "high": 108, "low": 101,
     "close": 105, "volume": 1_000_000}
    for d in range(1, 31)
]

SIGNALS = [
    {
        "signal_type": "buy", "style": "swing", "setup": "leader_trend",
        "session": "regular", "strength": 0.82, "entry_price": 105.0,
        "stop_loss": 98.0, "tp1": 119.0, "tp2": 126.0, "tp3": None,
        "risk_reward": 2.0, "holding_horizon": "weeks",
        "llm_rationale": "추세", "valid_until": None,
    },
    {  # sell 은 플랜에서 제외
        "signal_type": "sell", "style": "day", "setup": "breakout",
        "strength": 0.5, "entry_price": 100.0,
    },
]

INSTRUMENT = {"id": 1, "symbol": "005930", "name": "삼성전자",
              "exchange": "KOSPI", "sector": "IT", "active": True}


def _ctx(**over):
    base = dict(
        instrument=INSTRUMENT,
        valuation={"date": "2026-06-09", "per": 12.0, "pbr": 1.1, "roe": 9.0,
                   "dcf_value": 130.0, "upside_pct": 23.8},
        factor={"date": "2026-06-09", "composite_alpha": 0.5, "value_z": 0.3,
                "quality_z": 0.2, "momentum_z": 1.1, "lowvol_z": 0.0,
                "size_z": -0.2, "growth_z": None, "sector_rank": 3},
        signals=SIGNALS,
        ohlcv=OHLCV,
        flows=[{"date": "2026-06-09", "foreign_net": 1e9, "inst_net": -2e8,
                "retail_net": None}],
        backtests=[{"setup": "leader_trend", "win_rate": 0.55, "avg_rr": 1.8,
                    "mdd": 0.05, "sharpe": 1.1, "expectancy_r": 0.54,
                    "passed": True, "created_at": "2026-06-01"}],
    )
    base.update(over)
    return build_context(**base)


# ── 거래가능 게이트 ──────────────────────────────────────────────────

def test_turnover_and_atr():
    assert avg_turnover_krw(OHLCV) == 105 * 1_000_000
    a = atr_pct(OHLCV)
    assert a is not None and 0 < a < 1


def test_tradability_pass_and_fail():
    ok = build_tradability(active=True, turnover=TURNOVER_FLOOR_KRW,
                           atr=ATR_PCT_CEILING, signal_setups=["leader_trend"],
                           passed_setups={"leader_trend"})
    assert ok["passed"]
    bad = build_tradability(active=True, turnover=TURNOVER_FLOOR_KRW - 1,
                            atr=0.5, signal_setups=["breakout"],
                            passed_setups={"leader_trend"})
    assert not bad["passed"]
    failed = {c["key"] for c in bad["checks"] if not c["passed"]}
    assert failed == {"liquidity", "volatility", "backtest_gate"}


def test_backtest_gate_does_not_block_rating():
    """백테스트 게이트는 «참고 항목» — 판정을 막지 않는다(2026-08-23, 안 A).

    이 검사는 셋업 단위인데 발행 게이트는 (셋업 × 기간)이고, 시그널 자체가 이미 그
    게이트를 통과한 조합만 나온다. 리포트가 낡고 성긴 기준으로 한 번 더 판정하면
    «지금 살 수 있는 종목»이 「거래 부적합」으로 가려진다 — 실측으로 8/21 자 27건 중
    9건이 그 경우였고 그중 하나(오리온)는 그날 발행된 픽이었다.
    """
    t = build_tradability(active=True, turnover=TURNOVER_FLOOR_KRW,
                          atr=ATR_PCT_CEILING, signal_setups=["double_bottom"],
                          passed_setups=set())          # 통과 셋업 없음
    assert t["passed"], "종목 성질이 멀쩡하면 통과여야 한다"
    gate = next(c for c in t["checks"] if c["key"] == "backtest_gate")
    assert gate["passed"] is False and gate["blocking"] is False
    # 막는 검사가 하나라도 깨지면 여전히 미통과다.
    blocked = build_tradability(active=True, turnover=TURNOVER_FLOOR_KRW,
                                atr=0.5, signal_setups=["double_bottom"],
                                passed_setups={"double_bottom"})
    assert not blocked["passed"]


def test_tradable_now_matches_stored_verdict():
    """저장 시점 판정과 «지금» 재판정이 같은 규칙을 쓴다.

    예전에는 build_tradability 가 backtest_gate 를 막는 검사로 쓰고, daily.tradable_now
    는 빼고 봐서 둘이 어긋났다. 옛 리포트(blocking 플래그 없음)도 같은 결론이 나와야 한다.
    """
    from engine.reports.daily import tradable_now
    t = build_tradability(active=True, turnover=TURNOVER_FLOOR_KRW,
                          atr=ATR_PCT_CEILING, signal_setups=["double_bottom"],
                          passed_setups=set())
    assert tradable_now({"tradability": t}) == t["passed"] is True
    legacy = {"tradability": {"passed": False, "checks": [
        {"key": "active", "label": "", "passed": True},
        {"key": "liquidity", "label": "", "passed": True},
        {"key": "volatility", "label": "", "passed": True},
        {"key": "backtest_gate", "label": "", "passed": False},
    ]}}
    assert tradable_now(legacy) is True


def test_backtest_passed_thresholds():
    # 저장된 판정(passed) 우선
    assert backtest_passed({"passed": True, "expectancy_r": -1.0})
    assert not backtest_passed({"passed": False, "expectancy_r": 1.0})
    # 구버전 행 폴백: 기대값·R-MDD 재계산
    assert backtest_passed({"expectancy_r": 0.16, "mdd": 0.3})
    assert not backtest_passed({"expectancy_r": 0.01, "mdd": 0.3})
    assert not backtest_passed({"expectancy_r": 0.16, "mdd": 0.6})
    assert not backtest_passed({"win_rate": 0.5, "avg_rr": 1.5})  # 기대값 없음


# ── 판정 ────────────────────────────────────────────────────────────

def test_verdict_buy_neutral_blocked():
    buy = build_verdict(composite_alpha=0.8, upside_pct=50.0,
                        max_signal_strength=0.9, tradable=True)
    assert buy["rating"] == "매수" and buy["score"] >= 65
    watch = build_verdict(composite_alpha=-0.8, upside_pct=-40.0,
                          max_signal_strength=0.1, tradable=True)
    assert watch["rating"] == "관망"
    blocked = build_verdict(composite_alpha=0.8, upside_pct=50.0,
                            max_signal_strength=0.9, tradable=False)
    assert blocked["rating"] == "거래 부적합"


# ── 플랜 / 컨텍스트 ──────────────────────────────────────────────────

def test_plan_only_buy_sorted():
    plan = build_plan(SIGNALS)
    assert len(plan) == 1
    assert plan[0]["setup"] == "leader_trend"
    assert plan[0]["entry_price"] == 105.0


def test_context_assembles_sections_and_refs():
    ctx = _ctx()
    assert ctx["verdict"]["rating"] in {"매수", "중립", "관망"}
    assert ctx["tradability"]["passed"]
    assert ctx["plan"][0]["risk_reward"] == 2.0
    assert ctx["last_close"] == 105.0
    fields = {r["field"] for r in ctx["source_refs"]}
    assert {"per", "upside_pct", "composite_alpha", "last_close",
            "swing.entry_price"} <= fields
    # 백테스트는 시그널 보유 셋업만 노출
    assert [b["setup"] for b in ctx["backtests"]] == ["leader_trend"]
    assert ctx["backtests"][0]["passed"]


# ── 렌더 ────────────────────────────────────────────────────────────

def test_render_body_md_has_5_sections_and_disclaimer():
    ctx = _ctx()
    body = render_body_md(ctx, fallback_narrative(ctx))
    for marker in ("## ① 판정", "## ② 거래 가능 게이트", "## ③ 실행 플랜",
                   "## ④ 근거", "## ⑤ 리스크 요인"):
        assert marker in body
    assert DISCLAIMER in body
    assert "105원" in body  # 진입가 수치가 본문에 등장


# ── LLM 파싱 ────────────────────────────────────────────────────────

def test_parse_narrative_plain_and_fenced():
    raw = '{"thesis":"t","trader_view":"tv","quant_view":"q","risks":["r1"]}'
    assert parse_narrative(raw)["thesis"] == "t"
    fenced = f"```json\n{raw}\n```"
    assert parse_narrative(fenced)["risks"] == ["r1"]
    assert parse_narrative("not json") is None
    assert parse_narrative('{"thesis":"t"}') is None
