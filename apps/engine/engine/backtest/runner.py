"""백테스트 실행 — 플레이북별로 전 종목 백테스트 → 게이트 평가 → backtests 적재.

통과한 셋업 집합(passed_setups)은 시그널 발행 필터로 쓰인다.
"""
from __future__ import annotations

import pandas as pd

from engine.backtest.event_backtest import backtest_playbook
from engine.backtest.gate import GateThresholds, evaluate_gate
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
    return pd.DataFrame(rows)[["open", "high", "low", "close", "volume"]].astype(float)


def run(thresholds: GateThresholds | None = None) -> dict[str, bool]:
    """전 종목·전 플레이북 백테스트 → 셋업별 게이트 결과. {setup: passed}."""
    thr = thresholds or GateThresholds()
    inst = select_all("instruments", "id", eq={"active": True})
    frames = {it["id"]: _load_ohlcv(it["id"]) for it in inst}
    frames = {k: v for k, v in frames.items() if not v.empty}

    passed: dict[str, bool] = {}
    bt_rows: list[dict] = []
    for setup in playbooks.ALL_DETECTORS:
        trades: list[Trade] = []
        for df in frames.values():
            trades.extend(backtest_playbook(df, setup))
        gr = evaluate_gate(trades, thr)
        passed[setup] = gr.passed
        bt_rows.append({
            "strategy_key": f"playbook:{setup}",
            "setup": setup,
            "params": {"thresholds": thr.__dict__},
            "sharpe": sharpe([t.ret_pct for t in trades]),
            "mdd": gr.mdd,                 # R 곡선(리스크 1%) 기준
            "win_rate": gr.win_rate,
            "avg_rr": gr.avg_rr,
            "expectancy_r": gr.expectancy_r,
            "passed": gr.passed,           # 게이트 판정 저장 — 웹/리포트는 read만
            "period": "daily-history",
        })
        log.info("backtest.setup", setup=setup, passed=gr.passed,
                 n=gr.n_trades, reasons=gr.reasons)

    upsert("backtests", bt_rows)
    return passed


def passed_setups(thresholds: GateThresholds | None = None) -> list[str]:
    """게이트 통과 셋업 목록 (시그널 발행 필터용)."""
    return [s for s, ok in run(thresholds).items() if ok]
