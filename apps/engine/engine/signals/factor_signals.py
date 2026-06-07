"""멀티팩터 종합 시그널 — 합성알파 상위 종목을 매수 시그널로 발행.

차트 플레이북(per-instrument 패턴 탐지)과 달리 cross-sectional(단면 랭킹) 방식:
factor_scores.composite_alpha 상위 분위를 골라 가격레벨(진입/SL/TP)을 붙인다.
setup = 'factor_composite'.
"""
from __future__ import annotations

import pandas as pd

from engine.signals import indicators as ind
from engine.signals.levels import compute_levels
from engine.signals.styles import TradeStyle, get_style_config

SOURCE_VERSION = "factor-signal-v1"


def generate_factor_signals(
    scores: list[dict],
    frames: dict[int, pd.DataFrame],
    *,
    style: TradeStyle = "swing",
    session: str = "regular",
    top_pct: float = 0.1,
    min_alpha: float = 0.0,
    risk_per_trade_pct: float = 1.0,
) -> list[dict]:
    """합성알파 상위 top_pct 종목 → factor_composite 매수 시그널 행 리스트.

    scores: factor_scores 행(composite_alpha 등). frames: iid→ohlcv(오름차순).
    """
    ranked = sorted(
        (s for s in scores if s.get("composite_alpha") is not None),
        key=lambda s: s["composite_alpha"],
        reverse=True,
    )
    if not ranked:
        return []
    n_top = max(1, int(len(ranked) * top_pct))
    top = [s for s in ranked[:n_top] if s["composite_alpha"] >= min_alpha]
    if not top:
        return []

    alphas = [s["composite_alpha"] for s in top]
    amin, amax = min(alphas), max(alphas)
    cfg = get_style_config(style)
    rows: list[dict] = []
    for s in top:
        iid = s["instrument_id"]
        df = frames.get(iid)
        if df is None or len(df) < 20:
            continue
        entry = float(df["close"].iloc[-1])
        if entry <= 0:
            continue
        atr_val = float(ind.atr(df, cfg.atr_period).iloc[-1])
        if not (atr_val > 0):
            atr_val = entry * 0.03
        lv = compute_levels(
            style=style, side="buy", entry_price=entry, atr=atr_val,
            risk_per_trade_pct=risk_per_trade_pct,
        )
        rel = (s["composite_alpha"] - amin) / (amax - amin) if amax > amin else 1.0
        strength = round(0.55 + 0.4 * rel, 4)
        rows.append({
            "instrument_id": iid,
            "signal_type": "buy",
            "style": style,
            "setup": "factor_composite",
            "session": session,
            "strength": strength,
            "timeframe": cfg.timeframe,
            "entry_price": lv.entry_price,
            "stop_loss": round(lv.stop_loss, 4),
            "tp1": round(lv.tp1, 4),
            "tp2": round(lv.tp2, 4),
            "tp3": round(lv.tp3, 4),
            "risk_reward": round(lv.risk_reward, 4),
            "holding_horizon": lv.holding_horizon,
            "rule_payload": {"top_pct": top_pct},
            "factor_payload": {
                "composite_alpha": round(float(s["composite_alpha"]), 4),
                "sector_rank": s.get("sector_rank"),
                "momentum_z": s.get("momentum_z"),
                "value_z": s.get("value_z"),
            },
            "level_payload": {"atr": round(atr_val, 4)},
            "llm_rationale": (
                f"멀티팩터 합성알파 상위 {round(top_pct * 100)}% "
                f"(alpha={round(float(s['composite_alpha']), 3)})"
            ),
            "source_version": SOURCE_VERSION,
            "valid_until": lv.valid_until.isoformat() if lv.valid_until else None,
        })
    return rows
