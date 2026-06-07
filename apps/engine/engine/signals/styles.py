"""투자 스타일 설정 — 스타일별 타임프레임·ATR 배수·보유기간.

스타일이 가격 레벨(진입/TP/SL) 산출을 분기시키는 핵심 파라미터.
ATR 배수는 초기 휴리스틱이며, 이후 백테스트로 캘리브레이션한다(docs/PLAN.md).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

TradeStyle = Literal["scalping", "day", "swing", "position"]
STYLES: tuple[TradeStyle, ...] = ("scalping", "day", "swing", "position")


@dataclass(frozen=True)
class StyleConfig:
    style: TradeStyle
    timeframe: str                      # 시그널 산출 기준 봉
    atr_period: int                     # ATR 계산 기간
    stop_atr_mult: float                # 손절 = 진입 ∓ ATR*배수
    tp_atr_mults: tuple[float, ...]     # tp1/tp2/tp3 = 진입 ± ATR*배수
    holding_horizon: str
    valid_minutes: int | None           # 시그널 유효시간(분). None=명시적 만료 없음
    intraday_only: bool = False         # 당일 청산(데이트/스캘핑)


_CONFIGS: dict[TradeStyle, StyleConfig] = {
    "scalping": StyleConfig(
        style="scalping", timeframe="1m", atr_period=14,
        stop_atr_mult=0.8, tp_atr_mults=(1.0, 1.6, 2.4),
        holding_horizon="minutes", valid_minutes=30, intraday_only=True,
    ),
    "day": StyleConfig(
        style="day", timeframe="5m", atr_period=14,
        stop_atr_mult=1.2, tp_atr_mults=(1.5, 2.5, 4.0),
        holding_horizon="intraday", valid_minutes=None, intraday_only=True,
    ),
    "swing": StyleConfig(
        style="swing", timeframe="1d", atr_period=14,
        stop_atr_mult=1.8, tp_atr_mults=(2.0, 3.5, 5.0),
        holding_horizon="days", valid_minutes=60 * 24 * 5,
    ),
    "position": StyleConfig(
        style="position", timeframe="1w", atr_period=14,
        stop_atr_mult=3.0, tp_atr_mults=(3.0, 6.0, 10.0),
        holding_horizon="months", valid_minutes=60 * 24 * 30,
    ),
}


def get_style_config(style: TradeStyle) -> StyleConfig:
    if style not in _CONFIGS:
        raise ValueError(f"알 수 없는 스타일: {style}")
    return _CONFIGS[style]
