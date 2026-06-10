"""시그널 생성 실행 — DB OHLCV 적재분 → 플레이북 시그널 → signals 적재.

라이브 실행은 ohlcv 적재가 전제. 상대강도(rs_rank)는 단면에서 산출.
"""
from __future__ import annotations

import pandas as pd

from engine.db import get_client, select_all, upsert
from engine.logging import get_logger
from engine.signals.generate import generate_signals

log = get_logger(__name__)


def _load_ohlcv(instrument_id: int, limit: int = 120) -> pd.DataFrame:
    res = (
        get_client().table("ohlcv").select("ts,open,high,low,close,volume")
        .eq("instrument_id", instrument_id).eq("interval", "1d")
        .order("ts", desc=True).limit(limit).execute()
    )
    rows = list(reversed(res.data or []))
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    return df[["open", "high", "low", "close", "volume"]].astype(float)


def _rs_ranks(frames: dict[int, pd.DataFrame], window: int = 60) -> dict[int, float]:
    """종목별 window 수익률 → 횡단면 분위(0~1)."""
    rets: dict[int, float] = {}
    for iid, df in frames.items():
        if len(df) > window:
            rets[iid] = float(df["close"].iloc[-1] / df["close"].iloc[-window] - 1)
    if not rets:
        return {}
    s = pd.Series(rets)
    pct = s.rank(pct=True)
    return pct.to_dict()


def run(
    risk_per_trade_pct: float = 1.0,
    setups: list[str] | None = None,
    enforce_gate: bool = False,
) -> int:
    """활성 종목 전체에 대해 시그널 생성·적재.

    enforce_gate=True 면 백테스트 품질 게이트를 통과한 셋업만 발행(M6 연동).
    """
    if enforce_gate:
        from engine.backtest.runner import passed_setups
        allowed = set(passed_setups())
        setups = [s for s in (setups or list(allowed)) if s in allowed]
        log.info("signals.gate", allowed=sorted(allowed), effective=setups)
        if not setups:
            log.warning("signals.gate.none_passed")
            return 0

    inst = select_all("instruments", "id", eq={"active": True})
    frames = {it["id"]: _load_ohlcv(it["id"]) for it in inst}
    frames = {k: v for k, v in frames.items() if not v.empty}
    # 유동성 필터 — 백테스트로 검증된 모집단(거래대금 10억+)에만 시그널 발행.
    # 비유동 구간은 기대값 음수(scripts/diag_playbook_breakdown) → 발행 금지.
    from engine.liquidity import filter_liquid_frames
    n_all = len(frames)
    frames = filter_liquid_frames(frames)
    log.info("signals.universe", total=n_all, liquid=len(frames))
    ranks = _rs_ranks(frames)

    all_rows: list[dict] = []
    for iid, df in frames.items():
        all_rows.extend(
            generate_signals(
                df, iid, risk_per_trade_pct=risk_per_trade_pct,
                rs_rank=ranks.get(iid), setups=setups,
            )
        )

    # 멀티팩터 종합(factor_composite) — 단면 랭킹 기반. setups 필터에 포함되거나
    # 필터가 없을 때만 발행.
    if setups is None or "factor_composite" in setups:
        from engine.signals.factor_signals import generate_factor_signals
        scores = select_all(
            "factor_scores",
            "instrument_id,composite_alpha,sector_rank,momentum_z,value_z",
        )
        all_rows.extend(
            generate_factor_signals(scores, frames, risk_per_trade_pct=risk_per_trade_pct)
        )

    # 자연키 업서트 — 재실행해도 중복 누적 없이 같은 시그널을 갱신(0010).
    n = upsert(
        "signals", all_rows,
        on_conflict="instrument_id,style,setup,session,signal_type",
    )
    log.info("signals.run.done", rows=n, instruments=len(frames))
    return n
