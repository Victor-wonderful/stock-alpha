"""시그널 3축 정의 — style(보유기간) × setup(플레이북) × session(세션).

DB enum(0007_signal_axes.sql)과 동기화.
"""
from __future__ import annotations

from typing import Literal

TradeSetup = Literal[
    "factor_composite",
    "leader_trend",
    "oversold_bounce",
    "breakout",
    "close_betting",
    "flow_accumulation",
    "pullback",
    "high_52w",
    "vol_squeeze",
    "pead",
    "theme",
    "new_listing",
    "double_bottom",
    "anchor_pullback",
    "kalman",
    "sigma",
]
TradeSession = Literal["pre", "regular", "close", "after"]

SETUPS: tuple[TradeSetup, ...] = (
    "factor_composite", "leader_trend", "oversold_bounce",
    "breakout", "close_betting",
    "flow_accumulation", "pullback", "high_52w", "vol_squeeze", "pead",
    "theme", "new_listing",
    "double_bottom", "anchor_pullback", "kalman", "sigma",
)
SESSIONS: tuple[TradeSession, ...] = ("pre", "regular", "close", "after")

SETUP_LABELS: dict[TradeSetup, str] = {
    "factor_composite": "멀티팩터 종합",
    "leader_trend": "주도주 추세",
    "oversold_bounce": "과대낙폭 반등",
    "breakout": "돌파",
    "close_betting": "종가베팅",
    "flow_accumulation": "수급 동반 매집",
    "pullback": "눌림목",
    "high_52w": "52주 신고가",
    "vol_squeeze": "변동성 수축 돌파",
    "pead": "실적 모멘텀(PEAD)",
    "theme": "테마주",
    "new_listing": "신규주",
    "double_bottom": "쌍바닥(W)",
    "anchor_pullback": "기준봉 눌림",
    "kalman": "칼만 추세",
    "sigma": "시그마 평균회귀",
}

# 플레이북별 기본 매핑 (스타일·세션). 시그널 생성 시 기본값으로 사용.
SETUP_DEFAULT_STYLE = {
    "factor_composite": "position",
    "leader_trend": "swing",
    "oversold_bounce": "swing",
    "breakout": "swing",
    "close_betting": "day",
    "flow_accumulation": "swing",
    "pullback": "swing",
    "high_52w": "position",
    "vol_squeeze": "swing",
    "pead": "position",
    "double_bottom": "swing",
    "anchor_pullback": "swing",
    "kalman": "position",
    "sigma": "swing",
}
SETUP_DEFAULT_SESSION = {
    "factor_composite": "regular",
    "leader_trend": "regular",
    "oversold_bounce": "regular",
    "breakout": "regular",
    "close_betting": "close",
    "flow_accumulation": "regular",
    "pullback": "regular",
    "high_52w": "regular",
    "vol_squeeze": "regular",
    "pead": "regular",
    "double_bottom": "regular",
    "anchor_pullback": "regular",
    "kalman": "regular",
    "sigma": "regular",
}
