"""가격 레벨 산출 — 기술적 구조 기반 진입/손절/목표 + R:R + 포지션사이징.

순수 함수(외부 IO 없음) → 테스트 용이. `now` 를 주입받아 valid_until 계산.

설계(docs/PLAN.md):
  position_size_pct = risk_per_trade_pct ÷ 손절거리비율
  손절거리비율 = |진입 - 손절| / 진입
  → 손절 시 손실이 계좌의 risk_per_trade_pct% 가 되도록 비중 산정.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from engine.signals.styles import TradeStyle, get_style_config


@dataclass
class Levels:
    entry_price: float
    stop_loss: float
    tp1: float
    tp2: float
    tp3: float
    risk_reward: float          # 진입→tp1 기준 R
    position_size_pct: float    # 권장 계좌 비중(%)
    holding_horizon: str
    valid_until: datetime | None

    def as_row(self) -> dict:
        return {
            "entry_price": round(self.entry_price, 4),
            "stop_loss": round(self.stop_loss, 4),
            "tp1": round(self.tp1, 4),
            "tp2": round(self.tp2, 4),
            "tp3": round(self.tp3, 4),
            "risk_reward": round(self.risk_reward, 4),
            "position_size_pct": round(self.position_size_pct, 4),
            "holding_horizon": self.holding_horizon,
            "valid_until": self.valid_until.isoformat() if self.valid_until else None,
        }


def _clamp_stop_to_structure(
    side: str, entry: float, atr_stop: float,
    support: float | None, resistance: float | None,
) -> float:
    """기술적 지지/저항이 주어지면 그 바로 바깥을 손절로 사용(구조 우선).
    없으면 ATR 기반 손절을 사용."""
    if side == "buy":
        # 매수: 지지 바로 아래를 손절로 (진입보다 낮은 유효 지지일 때)
        if support is not None and support < entry:
            return support * 0.999
        return atr_stop
    else:
        # 매도: 저항 바로 위를 손절로
        if resistance is not None and resistance > entry:
            return resistance * 1.001
        return atr_stop


def compute_levels(
    *,
    style: TradeStyle,
    side: str,                       # 'buy' | 'sell'
    entry_price: float,
    atr: float,
    risk_per_trade_pct: float,
    support: float | None = None,
    resistance: float | None = None,
    now: datetime | None = None,
    market_close: datetime | None = None,
    max_position_pct: float = 25.0,
) -> Levels:
    if entry_price <= 0:
        raise ValueError("entry_price 는 양수여야 합니다.")
    if atr <= 0:
        raise ValueError("atr 는 양수여야 합니다.")
    if side not in ("buy", "sell"):
        raise ValueError("side 는 'buy' 또는 'sell'.")

    cfg = get_style_config(style)
    direction = 1 if side == "buy" else -1

    atr_stop = entry_price - direction * cfg.stop_atr_mult * atr
    stop = _clamp_stop_to_structure(side, entry_price, atr_stop, support, resistance)

    tps = tuple(entry_price + direction * m * atr for m in cfg.tp_atr_mults)

    risk_per_share = abs(entry_price - stop)
    reward_to_tp1 = abs(tps[0] - entry_price)
    rr = reward_to_tp1 / risk_per_share if risk_per_share > 0 else 0.0

    stop_distance_ratio = risk_per_share / entry_price
    raw_size = risk_per_trade_pct / stop_distance_ratio if stop_distance_ratio > 0 else 0.0
    position_size_pct = max(0.0, min(raw_size, max_position_pct))

    valid_until = _compute_valid_until(cfg, now, market_close)

    return Levels(
        entry_price=entry_price,
        stop_loss=stop,
        tp1=tps[0], tp2=tps[1], tp3=tps[2],
        risk_reward=rr,
        position_size_pct=position_size_pct,
        holding_horizon=cfg.holding_horizon,
        valid_until=valid_until,
    )


def _compute_valid_until(cfg, now, market_close) -> datetime | None:
    if now is None:
        now = datetime.now(timezone.utc)
    # 당일 청산 스타일은 장 마감을 만료로 (제공 시)
    if cfg.intraday_only and market_close is not None:
        if cfg.valid_minutes is not None:
            return min(market_close, now + timedelta(minutes=cfg.valid_minutes))
        return market_close
    if cfg.valid_minutes is not None:
        return now + timedelta(minutes=cfg.valid_minutes)
    return None
