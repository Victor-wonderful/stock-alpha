"""인뎁스 리포트 컨텍스트 — 코드가 계산한 수치만 모은다 (환각 차단).

build_* 함수는 순수 함수(행 → 구조화 dict). load_context() 가 DB 조회를 담당.
LLM 은 이 컨텍스트의 수치를 서술로 풀어쓸 뿐, 새 수치를 만들 수 없다.
모든 수치는 source_refs 로 DB 근거를 추적한다.
"""
from __future__ import annotations

from typing import Any

from engine.backtest.gate import GateThresholds

from engine.liquidity import REPORT_TURNOVER_FLOOR_KRW

# ── 거래가능(tradability) 게이트 기준 ──
TURNOVER_FLOOR_KRW = REPORT_TURNOVER_FLOOR_KRW  # 20일 평균 거래대금 하한(1억원)
ATR_PCT_CEILING = 0.12            # 일중 변동성 상한(ATR/종가 12%) — 투기성 과열 배제

# ── 종합 판정 등급 임계 (0~100점) ──
RATING_BUY = 65
RATING_NEUTRAL = 45

# ── EOD(장 마감 후) 발행에서 유효한 시그널 스타일 ──
# 발행 규정 v1(2026-06-10): 16:30 배치 시점에 스캘핑/데이/종가베팅은 이미
# 실행 시점이 지난 시그널 → 리포트 실행플랜·판정에서 제외. 종가베팅은
# 향후 15:00 장중 배치에서, 데이는 KIS 실시간 연동 후 별도 발행.
EOD_STYLES = ("swing", "position")


def avg_turnover_krw(ohlcv: list[dict], window: int = 20) -> float | None:
    """최근 window 일 평균 거래대금(종가×거래량, KRW). ohlcv 는 ts 오름차순."""
    rows = ohlcv[-window:]
    vals = [
        float(r["close"]) * float(r["volume"])
        for r in rows
        if r.get("close") is not None and r.get("volume") is not None
    ]
    return sum(vals) / len(vals) if vals else None


def atr_pct(ohlcv: list[dict], window: int = 14) -> float | None:
    """단순 ATR(TR 평균)/마지막 종가 — 변동성 게이트용. ohlcv 는 ts 오름차순."""
    if len(ohlcv) < 2:
        return None
    trs: list[float] = []
    for prev, cur in zip(ohlcv[-window - 1 : -1], ohlcv[-window:]):
        h, lo, pc = float(cur["high"]), float(cur["low"]), float(prev["close"])
        trs.append(max(h - lo, abs(h - pc), abs(lo - pc)))
    last_close = float(ohlcv[-1]["close"])
    if not trs or last_close <= 0:
        return None
    return (sum(trs) / len(trs)) / last_close


def backtest_passed(bt: dict, thr: GateThresholds | None = None) -> bool:
    """backtests 행 → 게이트 통과 여부.

    엔진이 저장한 판정(passed)을 우선 사용. 구버전 행(컬럼 없음)은
    M6 임계(기대값·R-MDD)로 재계산.
    """
    if bt.get("passed") is not None:
        return bool(bt["passed"])
    t = thr or GateThresholds()
    exp, mdd = bt.get("expectancy_r"), bt.get("mdd")
    if exp is None or float(exp) < t.min_expectancy_r:
        return False
    if mdd is not None and float(mdd) > t.max_mdd:
        return False
    return True


def build_tradability(
    *,
    active: bool,
    turnover: float | None,
    atr: float | None,
    signal_setups: list[str],
    passed_setups: set[str],
) -> dict:
    """②거래해도 괜찮나 — 체크리스트 게이트."""
    checks = [
        {
            "key": "active",
            "label": "거래 가능 종목 (ETF/ETN/스팩 제외 유니버스)",
            "passed": bool(active),
            "value": None,
        },
        {
            "key": "liquidity",
            "label": "유동성 — 20일 평균 거래대금 ≥ 1억원",
            "passed": turnover is not None and turnover >= TURNOVER_FLOOR_KRW,
            "value": round(turnover) if turnover is not None else None,
        },
        {
            "key": "volatility",
            "label": f"변동성 — ATR/종가 ≤ {ATR_PCT_CEILING:.0%}",
            "passed": atr is not None and atr <= ATR_PCT_CEILING,
            "value": round(atr, 4) if atr is not None else None,
        },
        {
            "key": "backtest_gate",
            "label": "백테스트 품질 게이트 — 셋업 중 1개 이상 통과",
            "passed": any(s in passed_setups for s in signal_setups),
            "value": sorted(s for s in signal_setups if s in passed_setups) or None,
        },
    ]
    return {"passed": all(c["passed"] for c in checks), "checks": checks}


def build_verdict(
    *,
    composite_alpha: float | None,
    upside_pct: float | None,
    max_signal_strength: float | None,
    tradable: bool,
) -> dict:
    """①사야 하나 — 퀀트(팩터)+밸류+트레이더 셋업 종합 0~100점 판정.

    가중치: 멀티팩터 40 / 밸류에이션 30 / 시그널 강도 30.
    거래가능 게이트 미통과면 점수와 무관하게 '거래 부적합'.
    """
    parts: dict[str, float] = {}
    if composite_alpha is not None:
        a = max(-1.0, min(1.0, float(composite_alpha)))
        parts["factor"] = (a + 1) / 2 * 40
    if upside_pct is not None:
        u = max(-50.0, min(100.0, float(upside_pct)))
        parts["valuation"] = (u + 50) / 150 * 30
    if max_signal_strength is not None:
        parts["signal"] = max(0.0, min(1.0, float(max_signal_strength))) * 30

    # 누락 축은 보수적으로 해당 축 중간값의 80%로 채움(데이터 없음 패널티)
    weights = {"factor": 40, "valuation": 30, "signal": 30}
    score = sum(parts.get(k, w / 2 * 0.8) for k, w in weights.items())
    score = round(score, 1)

    if not tradable:
        rating = "거래 부적합"
    elif score >= RATING_BUY:
        rating = "매수"
    elif score >= RATING_NEUTRAL:
        rating = "중립"
    else:
        rating = "관망"
    return {
        "score": score,
        "rating": rating,
        "components": {k: round(v, 1) for k, v in parts.items()},
        "weights": weights,
    }


def build_plan(
    signals: list[dict], styles: tuple[str, ...] | None = None
) -> list[dict]:
    """③얼마에 사고/팔고/손절 — 스타일별 실행 플랜 (시그널 가격레벨 그대로).

    styles 지정 시 해당 스타일만(EOD 발행은 스윙·포지션).
    """
    plan = []
    for s in signals:
        if s.get("signal_type") != "buy" or s.get("entry_price") is None:
            continue
        if styles is not None and s.get("style") not in styles:
            continue
        plan.append({
            "style": s["style"],
            "setup": s["setup"],
            "session": s.get("session"),
            "strength": float(s.get("strength") or 0),
            "entry_price": float(s["entry_price"]),
            "stop_loss": float(s["stop_loss"]) if s.get("stop_loss") is not None else None,
            "tp1": float(s["tp1"]) if s.get("tp1") is not None else None,
            "tp2": float(s["tp2"]) if s.get("tp2") is not None else None,
            "tp3": float(s["tp3"]) if s.get("tp3") is not None else None,
            "risk_reward": float(s["risk_reward"]) if s.get("risk_reward") is not None else None,
            "holding_horizon": s.get("holding_horizon"),
            "rationale": s.get("llm_rationale"),
            "valid_until": s.get("valid_until"),
        })
    plan.sort(key=lambda p: p["strength"], reverse=True)
    return plan


def flows_summary(flows: list[dict], window: int = 20) -> dict | None:
    """최근 window 일 외국인/기관 순매매 합계. flows 는 date 오름차순."""
    rows = flows[-window:]
    if not rows:
        return None

    def _sum(key: str) -> float | None:
        vals = [float(r[key]) for r in rows if r.get(key) is not None]
        return sum(vals) if vals else None

    return {
        "window_days": len(rows),
        "foreign_net": _sum("foreign_net"),
        "inst_net": _sum("inst_net"),
        "last_date": rows[-1].get("date"),
    }


def build_context(
    *,
    instrument: dict,
    valuation: dict | None,
    factor: dict | None,
    signals: list[dict],
    ohlcv: list[dict],
    flows: list[dict],
    backtests: list[dict],
    plan_styles: tuple[str, ...] | None = EOD_STYLES,
) -> dict[str, Any]:
    """리포트 5섹션의 수치 원본(payload) + source_refs 를 조립하는 순수 함수.

    plan_styles: 실행플랜·게이트·판정에 반영할 시그널 스타일.
      기본 EOD_STYLES(스윙·포지션) — 장 마감 후 발행에서 이미 실행 시점이
      지난 스타일(데이/종가베팅)을 배제. None 이면 전체.
    """
    iid = instrument["id"]
    if plan_styles is not None:
        signals = [s for s in signals if s.get("style") in plan_styles]
    refs: list[dict] = []

    def ref(field: str, table: str, value: Any, key: dict) -> Any:
        if value is not None:
            refs.append({"field": field, "table": table, "key": key, "value": value})
        return value

    # 최신 백테스트(셋업별) → 게이트 통과 셋업 집합
    latest_bt: dict[str, dict] = {}
    for bt in sorted(backtests, key=lambda b: b.get("created_at") or ""):
        if bt.get("setup"):
            latest_bt[bt["setup"]] = bt
    passed = {s for s, bt in latest_bt.items() if backtest_passed(bt)}

    turnover = avg_turnover_krw(ohlcv)
    atr = atr_pct(ohlcv)
    signal_setups = sorted({s["setup"] for s in signals if s.get("setup")})

    tradability = build_tradability(
        active=bool(instrument.get("active", True)),
        turnover=turnover,
        atr=atr,
        signal_setups=signal_setups,
        passed_setups=passed,
    )

    plan = build_plan(signals)
    val_key = {"instrument_id": iid, "date": (valuation or {}).get("date")}
    fac_key = {"instrument_id": iid, "date": (factor or {}).get("date")}

    valuation_view = None
    if valuation:
        valuation_view = {
            "date": valuation.get("date"),
            "per": ref("per", "valuations", valuation.get("per"), val_key),
            "pbr": ref("pbr", "valuations", valuation.get("pbr"), val_key),
            "roe": ref("roe", "valuations", valuation.get("roe"), val_key),
            "dcf_value": ref("dcf_value", "valuations", valuation.get("dcf_value"), val_key),
            "upside_pct": ref("upside_pct", "valuations", valuation.get("upside_pct"), val_key),
        }

    factor_view = None
    if factor:
        factor_view = {
            "date": factor.get("date"),
            "composite_alpha": ref(
                "composite_alpha", "factor_scores", factor.get("composite_alpha"), fac_key
            ),
            "value_z": factor.get("value_z"),
            "quality_z": factor.get("quality_z"),
            "momentum_z": factor.get("momentum_z"),
            "lowvol_z": factor.get("lowvol_z"),
            "size_z": factor.get("size_z"),
            "growth_z": factor.get("growth_z"),
            "sector_rank": factor.get("sector_rank"),
        }

    fsum = flows_summary(flows)
    if fsum:
        ref("foreign_net_20d", "flows", fsum["foreign_net"],
            {"instrument_id": iid, "window": fsum["window_days"]})
        ref("inst_net_20d", "flows", fsum["inst_net"],
            {"instrument_id": iid, "window": fsum["window_days"]})

    verdict = build_verdict(
        composite_alpha=(factor or {}).get("composite_alpha"),
        upside_pct=(valuation or {}).get("upside_pct"),
        max_signal_strength=max((p["strength"] for p in plan), default=None),
        tradable=tradability["passed"],
    )

    for p in plan:
        key = {"instrument_id": iid, "style": p["style"], "setup": p["setup"]}
        for f in ("entry_price", "stop_loss", "tp1", "risk_reward"):
            ref(f"{p['style']}.{f}", "signals", p.get(f), key)

    last_close = float(ohlcv[-1]["close"]) if ohlcv else None
    if last_close is not None:
        ref("last_close", "ohlcv", last_close, {"instrument_id": iid, "ts": ohlcv[-1].get("ts")})

    backtest_view = [
        {
            "setup": s,
            "win_rate": bt.get("win_rate"),
            "avg_rr": bt.get("avg_rr"),
            "mdd": bt.get("mdd"),
            "sharpe": bt.get("sharpe"),
            "expectancy_r": bt.get("expectancy_r"),
            "passed": s in passed,
        }
        for s, bt in sorted(latest_bt.items())
        if s in signal_setups
    ]

    return {
        "instrument": {
            "id": iid,
            "symbol": instrument.get("symbol"),
            "name": instrument.get("name"),
            "exchange": instrument.get("exchange"),
            "sector": instrument.get("sector"),
        },
        "last_close": last_close,
        "verdict": verdict,            # ① 판정
        "tradability": tradability,    # ② 게이트
        "plan": plan,                  # ③ 실행 플랜
        "valuation": valuation_view,   # ④ 근거 — 밸류
        "factor": factor_view,         # ④ 근거 — 퀀트 팩터
        "flows": fsum,                 # ④ 근거 — 수급
        "backtests": backtest_view,    # ④ 근거 — 백테스트
        "source_refs": refs,
    }


# ── DB 로더 (I/O 경계) ──────────────────────────────────────────────

def _latest_row(table: str, instrument_id: int, order_col: str = "date") -> dict | None:
    from engine.db import get_client

    res = (
        get_client().table(table).select("*")
        .eq("instrument_id", instrument_id)
        .order(order_col, desc=True).limit(1).execute()
    )
    return (res.data or [None])[0]


def load_context(
    symbol: str, plan_styles: tuple[str, ...] | None = EOD_STYLES
) -> dict[str, Any] | None:
    """심볼 1개의 리포트 컨텍스트 로드. instruments 에 없으면 None."""
    from engine.db import get_client, select_all

    client = get_client()
    inst_rows = select_all("instruments", "*", eq={"symbol": symbol})
    if not inst_rows:
        return None
    inst = inst_rows[0]
    iid = inst["id"]

    valuation = _latest_row("valuations", iid)
    factor = _latest_row("factor_scores", iid)

    signals = (
        client.table("signals").select("*")
        .eq("instrument_id", iid).eq("signal_type", "buy")
        .order("created_at", desc=True).limit(50).execute()
    ).data or []

    ohlcv = list(reversed((
        client.table("ohlcv").select("ts,open,high,low,close,volume")
        .eq("instrument_id", iid).eq("interval", "1d")
        .order("ts", desc=True).limit(120).execute()
    ).data or []))

    flows = list(reversed((
        client.table("flows").select("date,foreign_net,inst_net,retail_net")
        .eq("instrument_id", iid)
        .order("date", desc=True).limit(20).execute()
    ).data or []))

    backtests = select_all(
        "backtests", "setup,win_rate,avg_rr,mdd,sharpe,expectancy_r,passed,created_at"
    )

    return build_context(
        instrument=inst, valuation=valuation, factor=factor,
        signals=signals, ohlcv=ohlcv, flows=flows, backtests=backtests,
        plan_styles=plan_styles,
    )
