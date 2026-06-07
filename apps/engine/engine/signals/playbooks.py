"""플레이북(셋업) 탐지 — 일봉 OHLCV(+선택 컨텍스트)에서 시그널 후보 산출.

각 detect_* 는 순수 함수. 마지막 봉 기준으로 트리거 여부를 판단하고,
트리거 시 Candidate(진입 참조가·ATR·지지/저항·근거)를 반환, 아니면 None.
가격 레벨(진입/TP/SL)은 이후 levels.compute_levels 가 산출한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from engine.signals import indicators as ind
from engine.signals.axes import TradeSession, TradeSetup
from engine.signals.styles import TradeStyle


@dataclass
class Candidate:
    setup: TradeSetup
    side: str                       # 'buy' | 'sell'
    style: TradeStyle
    session: TradeSession
    entry_ref: float                # 진입 참조가 (보통 마지막 종가/돌파가)
    atr: float
    support: float | None = None
    resistance: float | None = None
    strength: float = 0.5           # 0~1
    rationale: list[str] = field(default_factory=list)
    payload: dict = field(default_factory=dict)


def _last(s: pd.Series) -> float:
    return float(s.iloc[-1])


def detect_leader_trend(
    df: pd.DataFrame, rs_rank: float | None = None,
) -> Candidate | None:
    """주도주 추세: 정배열(종가>MA20>MA60) + 양의 모멘텀 (+상대강도 상위면 가산)."""
    if len(df) < 60:
        return None
    close = df["close"]
    ma20, ma60 = ind.sma(close, 20), ind.sma(close, 60)
    c, m20, m60 = _last(close), _last(ma20), _last(ma60)
    if not (c > m20 > m60):
        return None
    atr = _last(ind.atr(df))
    strength = 0.6
    bits = ["정배열(종가>MA20>MA60)"]
    if rs_rank is not None and rs_rank >= 0.8:  # 상위 20% 상대강도
        strength = min(1.0, strength + 0.2)
        bits.append(f"상대강도 상위({rs_rank:.0%})")
    return Candidate(
        setup="leader_trend", side="buy", style="swing", session="regular",
        entry_ref=c, atr=atr, support=m20, strength=strength, rationale=bits,
        payload={"ma20": m20, "ma60": m60},
    )


def detect_oversold_bounce(df: pd.DataFrame) -> Candidate | None:
    """과대낙폭 반등: RSI<30 또는 이격도<90 + 당일 반등(종가>전일 종가)."""
    if len(df) < 20:
        return None
    close = df["close"]
    rsi = _last(ind.rsi(close))
    disp = _last(ind.disparity(close, 20))
    bounced = _last(close) > float(close.iloc[-2])
    oversold = rsi < 30 or disp < 90
    if not (oversold and bounced):
        return None
    atr = _last(ind.atr(df))
    down = ind.consecutive_down(close.iloc[:-1])  # 반등 직전까지 연속 음봉
    strength = 0.5 + min(0.3, down * 0.05) + (0.1 if rsi < 25 else 0.0)
    bits = [f"RSI {rsi:.0f}", f"이격도 {disp:.0f}", f"직전 연속음봉 {down}", "당일 반등"]
    return Candidate(
        setup="oversold_bounce", side="buy", style="swing", session="regular",
        entry_ref=_last(close), atr=atr, support=_last(df["low"]),
        strength=min(1.0, strength), rationale=bits,
        payload={"rsi": rsi, "disparity": disp, "down_streak": down},
    )


def detect_breakout(df: pd.DataFrame, lookback: int = 20, vol_mult: float = 1.5) -> Candidate | None:
    """돌파: 직전 lookback일 신고가 상향 돌파 + 거래량 증가."""
    if len(df) < lookback + 1:
        return None
    high, close, vol = df["high"], df["close"], df["volume"]
    prior_high = _last(ind.rolling_high(high, lookback))
    c = _last(close)
    if c <= prior_high:
        return None
    avg_vol = float(vol.iloc[-(lookback + 1):-1].mean())
    v = _last(vol)
    if avg_vol > 0 and v < avg_vol * vol_mult:
        return None
    atr = _last(ind.atr(df))
    strength = 0.6 + (0.2 if (avg_vol > 0 and v > avg_vol * 2) else 0.0)
    bits = [f"{lookback}일 신고가 돌파", f"거래량 {v/avg_vol:.1f}x" if avg_vol else "거래량 증가"]
    return Candidate(
        setup="breakout", side="buy", style="swing", session="regular",
        entry_ref=c, atr=atr, support=prior_high,  # 돌파 레벨이 지지로 전환
        strength=min(1.0, strength), rationale=bits,
        payload={"breakout_level": prior_high, "vol_ratio": (v / avg_vol) if avg_vol else None},
    )


def detect_close_betting(df: pd.DataFrame, vol_mult: float = 1.2) -> Candidate | None:
    """종가베팅: 당일 강세(양봉 + 종가가 당일 고가 근처) + 거래량 증가 → 종가 진입(오버나잇)."""
    if len(df) < 20:
        return None
    o, h, l, c, vol = df["open"], df["high"], df["low"], df["close"], df["volume"]
    co, ch, cl, cc = _last(o), _last(h), _last(l), _last(c)
    if cc <= co:                       # 양봉 아님
        return None
    rng = ch - cl
    if rng <= 0 or (ch - cc) / rng > 0.25:   # 종가가 고가 상위 25% 밖이면 제외
        return None
    avg_vol = float(vol.iloc[-21:-1].mean())
    if avg_vol > 0 and _last(vol) < avg_vol * vol_mult:
        return None
    atr = _last(ind.atr(df))
    strength = 0.55 + (0.15 if (avg_vol > 0 and _last(vol) > avg_vol * 1.8) else 0.0)
    return Candidate(
        setup="close_betting", side="buy", style="day", session="close",
        entry_ref=cc, atr=atr, support=cl,
        strength=min(1.0, strength),
        rationale=["당일 강세 양봉", "종가 고가권 마감", "거래량 증가"],
        payload={"day_range_pos": (cc - cl) / rng},
    )


ALL_DETECTORS = {
    "leader_trend": detect_leader_trend,
    "oversold_bounce": detect_oversold_bounce,
    "breakout": detect_breakout,
    "close_betting": detect_close_betting,
}
