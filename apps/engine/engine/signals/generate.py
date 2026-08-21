"""시그널 생성 — 플레이북 탐지 + levels(진입/TP/SL) 결합 → signals 행.

순수 조립 함수(generate_signals)는 DB 없이 테스트 가능.
"""
from __future__ import annotations

from datetime import datetime

import pandas as pd

from engine.signals import playbooks
from engine.signals.levels import compute_levels, min_risk_floor
from engine.signals.styles import get_style_config

SOURCE_VERSION = "signal-v1"

# 진입 규칙 — 발행 시그널은 «다음 거래일 시가 시장가»를 전제한다(2026-08-21 전환).
# 여기 적히는 entry_price 는 그 시가를 아직 모르는 시점의 «예상»(당일 종가 기준)이다.
# reports/daily.ENTRY_RULE · gate.GATE_ENTRY_MODE 와 반드시 같이 움직여야 한다.
ENTRY_RULE = "next_open"


def generate_signals(
    df: pd.DataFrame,
    instrument_id: int,
    *,
    risk_per_trade_pct: float = 1.0,
    rs_rank: float | None = None,
    setups: list[str] | None = None,
    flows: "pd.DataFrame | None" = None,
    earnings: "pd.DataFrame | None" = None,
    disclosures: "pd.DataFrame | None" = None,
    now: datetime | None = None,
    market_close: datetime | None = None,
    styles_by_setup: dict[str, list[str]] | None = None,
) -> list[dict]:
    """일봉 OHLCV → 트리거된 플레이북별 시그널 행 리스트.

    df: open/high/low/close/volume (시간 오름차순)
    rs_rank: 상대강도 분위(0~1) — 주도주 판정 가산용
    flows: [date, foreign_net, inst_net] 오름차순 — 수급 셋업용(없으면 미발동)
    earnings: [date, surprise, turnaround] 오름차순 — PEAD 용(없으면 미발동)
    disclosures: [date, event_type] 오름차순 — 공시 이벤트 셋업용(없으면 미발동)
    setups: 활성화할 플레이북 키. None=전체.
    styles_by_setup: 셋업별 발행할 스타일 목록(게이트 통과 조합). 주어지면 한 트리거가
        통과 스타일마다 1행 발행(같은 셋업 swing·position 동시 가능). None 이면 단일
        cand.style 발행(하위호환·단위테스트).
    """
    enabled = setups or list(playbooks.ALL_DETECTORS.keys())
    rows: list[dict] = []

    for key in enabled:
        detector = playbooks.ALL_DETECTORS.get(key)
        if detector is None:
            continue
        # 컨텍스트가 필요한 탐지기만 해당 인자 전달
        if key == "leader_trend":
            cand = detector(df, rs_rank=rs_rank)
        elif key == "flow_accumulation":
            cand = detector(df, flows=flows)
        elif key == "pead":
            cand = detector(df, earnings=earnings)
        elif key in playbooks.DISCLOSURE_SETUPS:
            cand = detector(df, disclosures=disclosures)
        else:
            cand = detector(df)
        if cand is None:
            continue

        # 발행할 스타일 — 게이트 통과 조합(styles_by_setup) 우선, 없으면 단일 cand.style.
        emit_styles = (
            styles_by_setup.get(cand.setup, []) if styles_by_setup is not None
            else [cand.style]
        )
        for style in emit_styles:
            lv = compute_levels(
                style=style, side=cand.side, entry_price=cand.entry_ref,
                atr=cand.atr, risk_per_trade_pct=risk_per_trade_pct,
                support=cand.support, resistance=cand.resistance,
                now=now, market_close=market_close,
                setup=cand.setup,
            )
            # 노이즈 수준 손절폭 배제 — 백테스트(event_backtest)와 동일 기준.
            if abs(lv.entry_price - lv.stop_loss) < min_risk_floor(lv.entry_price, cand.atr):
                continue

            cfg = get_style_config(style)
            rows.append({
                "instrument_id": instrument_id,
                "signal_type": cand.side,            # 'buy' | 'sell'
                "style": style,
                "setup": cand.setup,
                "session": cand.session,
                "strength": round(cand.strength, 4),
                "timeframe": cfg.timeframe,
                "entry_price": lv.entry_price,
                "stop_loss": round(lv.stop_loss, 4),
                "tp1": round(lv.tp1, 4),
                "tp2": round(lv.tp2, 4),
                "tp3": round(lv.tp3, 4),
                "risk_reward": round(lv.risk_reward, 4),
                # position_size_pct 는 저장하지 않는다 — 읽기 시점 계산(웹 lib/position).
                "holding_horizon": lv.holding_horizon,
                "rule_payload": cand.payload,
                "factor_payload": {"rs_rank": rs_rank} if rs_rank is not None else None,
                "level_payload": {
                    "atr": round(cand.atr, 4),
                    "support": cand.support,
                    "resistance": cand.resistance,
                    # 진입 «규칙». entry_price 는 이 종가 기준으로 계산한 «예상»이고,
                    # 실제 진입은 다음 거래일 시가 시장가다 — 게이트도 같은 가정으로
                    # 잰다(gate.GATE_ENTRY_MODE). 웹이 이 값을 보고 표기를 바꾼다.
                    "entry_rule": ENTRY_RULE,
                },
                "llm_rationale": " · ".join(cand.rationale) or None,
                "source_version": SOURCE_VERSION,
                "valid_until": lv.valid_until.isoformat() if lv.valid_until else None,
            })
    return rows
