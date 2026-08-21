"""백테스트 실행 — 플레이북별로 전 종목 백테스트 → 게이트 평가 → backtests 적재.

통과한 셋업 집합(passed_setups)은 시그널 발행 필터로 쓰인다.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pandas as pd

from engine.backtest.costs import default_cost_model
from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GATE_ENTRY_MODE, GateThresholds, evaluate_gate
from engine.backtest.metrics import Trade, sharpe
from engine.db import get_client, select_all, upsert
from engine.logging import get_logger
from engine.signals import playbooks

log = get_logger(__name__)


def _load_ohlcv(instrument_id: int, limit: int = 500) -> pd.DataFrame:
    res = (
        get_client().table("ohlcv").select("ts,open,high,low,close,volume")
        .eq("instrument_id", instrument_id).eq("interval", "1d")
        .order("ts", desc=True).limit(limit).execute()
    )
    rows = list(reversed(res.data or []))
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    out = df[["open", "high", "low", "close", "volume"]].astype(float)
    out["ts"] = df["ts"]  # 트레이드 진입시점 기록용(시간순 MDD)
    return out


def _load_active_frames(bars: int = 500) -> dict[int, pd.DataFrame]:
    """활성 종목 일봉 {iid: df} — 직접 PG 벌크(단일쿼리) 우선, 실패 시 REST 폴백.

    원격 DB 지연 회피: 종목별 REST(수천 왕복) 대신 한 번의 스트리밍 쿼리.
    """
    from engine import db_direct
    if db_direct.available():
        try:
            return db_direct.load_all_ohlcv_1d(bars=bars)
        except Exception as e:  # noqa: BLE001
            log.warning("backtest.direct_pg_failed_fallback_rest", error=str(e)[:140])
    inst = select_all("instruments", "id", eq={"active": True})
    frames = {it["id"]: _load_ohlcv(it["id"], limit=bars) for it in inst}
    return {k: v for k, v in frames.items() if not v.empty}


def run(
    thresholds: GateThresholds | None = None, *, scaleout: bool = True,
    entry_mode: str = GATE_ENTRY_MODE,
) -> dict[tuple[str, str], bool]:
    """전 종목·(셋업×스타일) 매트릭스 백테스트 → 조합별 게이트 결과. {(setup,style): passed}.

    각 셋업을 그 셋업이 '논리적으로 허용하고(playbooks.ALLOWED_STYLES) 일봉으로 검증
    가능한(DAILY_TESTABLE_STYLES)' 스타일마다 백테스트한다. 통과한 (셋업×스타일) 조합만
    발행된다 — 같은 셋업이 swing·position 둘 다 통과하면 둘 다 발행. day/scalping 은
    분봉 필요(2단계)라 여기서 평가 대상이 아니다.

    scaleout: 청산 규칙. True(기본)=분할익절(tp1 50%+본전스톱 후 tp2 런) — 라이브
    수명주기(resolve_pick_status)와 동일 규칙. 게이트와 라이브가 같은 청산을 쓰도록
    단일 출처로 둔다(diag_scaleout 검증: 6/7 셋업 net 기대값↑).

    entry_mode: 진입 «체결» 가정. 기본 GATE_ENTRY_MODE="open" (다음 거래일 시가
    시장가) — 라이브 발행과 같은 가정이다. 청산과 마찬가지로 진입도 게이트와
    라이브가 어긋나면 안 된다: 예전 기본값 "signal"(신호가 무조건 체결)은 갭업해
    도망간 종목까지 샀다고 세어, 게이트가 통과시킨 기대값이 라이브에서 하나도
    성립하지 않았다(13조합 전수 비교, 2026-08-20).
    """
    thr = thresholds or GateThresholds()
    frames = _load_active_frames(bars=500)
    # 유동성 필터 — 시그널 발행 유니버스와 동일 모집단으로 백테스트(engine/liquidity).
    from engine.liquidity import filter_liquid_frames
    n_all = len(frames)
    frames = filter_liquid_frames(frames)
    log.info("backtest.universe", total=n_all, liquid=len(frames))

    from engine.signals.runner import (
        load_disclosures_map,
        load_earnings_map,
        load_flows_map,
    )
    flows_map = load_flows_map()
    earnings_map = load_earnings_map()
    discl_map = load_disclosures_map()

    prev = _load_prev_verdicts(entry_mode)

    costs = default_cost_model()
    log.info("backtest.costs", commission_pct=costs.commission_pct,
             tax_pct=costs.tax_pct, slippage_pct=costs.slippage_pct)

    passed: dict[tuple[str, str], bool] = {}
    bt_rows: list[dict] = []
    for setup in playbooks.ALL_DETECTORS:
        for style in playbooks.testable_styles(setup):
            trades: list[Trade] = []
            for iid, df in frames.items():
                trades.extend(
                    backtest_playbook(
                        df, setup,
                        flows=flows_map.get(iid),
                        earnings=earnings_map.get(iid),
                        disclosures=discl_map.get(iid),
                        costs=costs,
                        style_override=style,
                        scaleout=scaleout,
                        entry_mode=entry_mode,
                    )
                )
            # 시간순 정렬 — MDD 는 순서 민감(시간순 = 실제 시퀀스).
            trades.sort(key=lambda t: t.entry_ts)
            gr = evaluate_gate(trades, thr)
            gross_exp = (
                round(sum(t.r_gross for t in trades) / len(trades), 4)
                if trades else None
            )
            cost_drag = (
                round(gross_exp - gr.expectancy_r, 4)
                if gross_exp is not None and gr.expectancy_r is not None else None
            )
            key = (setup, style)
            effective = apply_hysteresis(gr.passed, prev.get(key))
            passed[key] = effective
            bt_rows.append({
                "strategy_key": f"playbook:{setup}:{style}",
                "setup": setup,
                "style": style,
                "params": {"thresholds": thr.__dict__, "costs": costs.__dict__,
                           "gross_expectancy_r": gross_exp,
                           "entry_mode": entry_mode,
                           "walkforward": gr.walkforward},
                "sharpe": sharpe([t.ret_pct for t in trades]),
                "mdd": gr.mdd,
                "win_rate": gr.win_rate,
                "avg_rr": gr.avg_rr,
                "expectancy_r": gr.expectancy_r,  # 비용 차감 net
                "passed": effective,
                "passed_raw": gr.passed,
                "period": "daily-history",
            })
            if effective != gr.passed:
                log.info("backtest.gate.held", setup=setup, style=style,
                         raw=gr.passed, held=effective)
            wf = gr.walkforward or {}
            log.info("backtest.setup", setup=setup, style=style, passed=effective,
                     raw=gr.passed, n=gr.n_trades, gross_exp=gross_exp,
                     net_exp=gr.expectancy_r, cost_drag=cost_drag,
                     mdd=gr.mdd, wf_eval=wf.get("evaluable"),
                     wf_pos_frac=wf.get("positive_frac"),
                     wf_recent=wf.get("recent_expectancy_r"), reasons=gr.reasons)

    upsert("backtests", bt_rows)
    return passed


def _load_prev_verdicts(entry_mode: str = GATE_ENTRY_MODE) -> dict[tuple[str, str], dict]:
    """(셋업×스타일)별 직전 런 판정 {(setup,style): {passed, passed_raw}}.

    style 없는 옛 행(매트릭스 이전)은 매칭 안 됨 → 첫 측정으로 취급(무해).

    ⚠️ **같은 진입 가정(entry_mode)으로 잰 행만 본다.** 히스테리시스는 "2회 연속
    같은 원측정일 때만 상태를 바꾼다" 이므로, 가정이 바뀐 첫 런에서 옛 가정의
    판정을 직전 값으로 쓰면 **이번에 탈락한 조합이 한 런 더 통과로 유지된다** —
    signal→open 전환에서는 그게 곧 «라이브 기대값이 마이너스인 조합을 하루 더
    발행»하는 것이다. 가정이 다르면 비교 대상이 아니다(옛 행은 entry_mode 키가
    없어 자연히 제외된다).
    """
    latest: dict[tuple[str, str], dict] = {}
    rows = sorted(
        select_all("backtests", "setup,style,passed,passed_raw,params,created_at"),
        key=lambda b: b.get("created_at") or "",
    )
    for bt in rows:
        if not (bt.get("setup") and bt.get("style")):
            continue
        if ((bt.get("params") or {}).get("entry_mode")) != entry_mode:
            continue
        latest[(bt["setup"], bt["style"])] = bt
    return latest


def apply_hysteresis(raw: bool, prev: dict | None) -> bool:
    """게이트 히스테리시스 (순수) — 경계선 셋업의 일일 PASS/FAIL 플립 억제.

    상태 변경은 '2회 연속 같은 원측정'일 때만:
      · 이번 측정 == 직전 안정화 판정 → 유지 (변화 없음)
      · 다르면, 직전 런의 원측정도 같은 방향이었을 때만 상태 전환
      · 첫 측정(이전 기록 없음)은 그대로 채택
    """
    if prev is None:
        return raw
    prev_eff = bool(prev.get("passed"))
    prev_raw = prev.get("passed_raw")
    prev_raw = prev_eff if prev_raw is None else bool(prev_raw)
    if raw == prev_eff:
        return raw
    return raw if prev_raw == raw else prev_eff


def passed_combos(thresholds: GateThresholds | None = None) -> dict[str, list[str]]:
    """게이트 통과 (셋업→통과 스타일 목록). 재백테스트 실행. 시그널 발행 필터용."""
    out: dict[str, list[str]] = {}
    for (setup, style), ok in run(thresholds).items():
        if ok:
            out.setdefault(setup, []).append(style)
    return out


def passed_setups(thresholds: GateThresholds | None = None) -> list[str]:
    """게이트를 어떤 스타일로든 통과한 셋업 목록 (셋업 단위 소비처용)."""
    return list(passed_combos(thresholds).keys())


def passed_combos_from_db(as_of: str | None = None) -> dict[str, list[str]]:
    """backtests 최신 행 기준 통과 (셋업→스타일 목록) — 재백테스트 없이 read.

    daily 배치/signals --gate 발행 필터용. 직전 backtest 런이 적재한 안정화 판정 사용.

    as_of: 주면 그 날(KST 종료) 이전에 적재된 행만 본다 — 과거일 픽 백필에서
      '지금 통과한 조합'을 쓰면 나중에 좋아진 걸 알고 고르는 셈이 된다.
      backtests 는 매 배치일 적재되므로 당시 게이트가 그대로 복원된다.
    """
    cutoff = gate_cutoff(as_of)
    latest: dict[tuple[str, str], dict] = {}
    for bt in sorted(
        select_all("backtests", "setup,style,passed,created_at"),
        key=lambda b: b.get("created_at") or "",
    ):
        if bt.get("setup") and bt.get("style") and _within(bt, cutoff):
            latest[(bt["setup"], bt["style"])] = bt
    out: dict[str, list[str]] = {}
    for (setup, style), bt in latest.items():
        if bt.get("passed"):
            out.setdefault(setup, []).append(style)
    return out


def gate_cutoff(as_of: str | None) -> datetime | None:
    """as_of(KST 날짜) 하루의 끝을 UTC 기준 시각으로. as_of 없으면 None(제한 없음).

    배치는 as_of 당일 백테스트를 돌린 뒤 픽을 고른다 — 그래서 당일 적재분까지 포함이다.
    """
    if not as_of:
        return None
    kst = timezone(timedelta(hours=9))
    d = date.fromisoformat(as_of)
    return datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=kst)


def _within(bt: dict, cutoff: datetime | None) -> bool:
    """행의 created_at 이 cutoff 이하인가. cutoff 없으면 항상 True."""
    if cutoff is None:
        return True
    raw = bt.get("created_at")
    if not raw:
        return False
    try:
        ts = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts <= cutoff
