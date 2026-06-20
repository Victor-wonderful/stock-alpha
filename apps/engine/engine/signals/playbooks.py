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
        setup="leader_trend", side="buy", style="position", session="regular",
        entry_ref=c, atr=atr, support=m20, strength=strength, rationale=bits,
        payload={"ma20": m20, "ma60": m60},
    )


def detect_oversold_bounce(df: pd.DataFrame) -> Candidate | None:
    """과대낙폭 반등(투매 후 반전) — 한국시장 숏 불가 → 하락장에서 롱으로 수익 내는 역추세.

    단순 과매도 매수는 '떨어지는 칼날'을 잡아 손실(구버전 -0.07R). 핵심은 **투매**
    (capitulation: 급락·연속음봉)로 과매도가 된 뒤, **반전이 실제로 시작됐다는 확인**
    (강한 양봉·종가 고가권·거래량)이 있을 때만 진입하는 것. 손절은 반전 저점(당일 저가)
    바로 아래라 타이트 → 실패 시 빠르게 끊고 R:R 확보.
    """
    if len(df) < 30:
        return None
    o, h, l, close = df["open"], df["high"], df["low"], df["close"]
    c0 = _last(close)
    if c0 <= 0:                                        # 거래정지 이력(0원) 가드
        return None
    rsi = _last(ind.rsi(close))
    disp = _last(ind.disparity(close, 20))
    # 1) 과매도 — RSI·이격도 둘 다(진짜 낙폭). 단일 조건(OR)은 약함.
    if not (rsi < 35 and disp < 95):
        return None
    # 2) 투매 — 직전까지 2연속 이상 음봉 또는 최근 5일 급락(-6% 이하)
    down = ind.consecutive_down(close.iloc[:-1])
    ret5 = c0 / float(close.iloc[-6]) - 1 if len(close) >= 6 else 0.0
    if not (down >= 2 or ret5 <= -0.06):
        return None
    # 3) 반전 확인 — 당일 강한 양봉 + 종가 고가권(상위 45%) + 전일 종가 1%+ 상회
    co, ch, cl = _last(o), _last(h), _last(l)
    rng = ch - cl
    if c0 <= co or rng <= 0:                           # 양봉 아님
        return None
    if (ch - c0) / rng > 0.45:                         # 종가가 당일 고가권 아님
        return None
    if c0 < float(close.iloc[-2]) * 1.01:              # 전일 대비 1%+ 반등(반전 강도)
        return None
    # 4) 거래량 확인 — 평균 이상(참여 동반)
    avg_vol = float(df["volume"].iloc[-21:-1].mean())
    if avg_vol > 0 and _last(df["volume"]) < avg_vol:
        return None
    atr = _last(ind.atr(df))
    strength = 0.55 + min(0.25, down * 0.05) + (0.1 if rsi < 28 else 0.0)
    bits = [f"RSI {rsi:.0f}·이격도 {disp:.0f}(과매도)",
            f"투매(연속음봉 {down}·5일 {ret5:+.1%})", "강한 반전 양봉·거래량 동반"]
    return Candidate(
        setup="oversold_bounce", side="buy", style="swing", session="regular",
        entry_ref=c0, atr=atr, support=cl,             # 손절=반전 저점(당일 저가) 하단
        strength=min(1.0, strength), rationale=bits,
        payload={"rsi": rsi, "disparity": disp, "down_streak": down,
                 "ret5": round(ret5, 4)},
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
        setup="breakout", side="buy", style="position", session="regular",
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


def detect_pullback(df: pd.DataFrame) -> Candidate | None:
    """눌림목: 상승 추세(MA20>MA60, 종가>MA60) 중 MA20 부근까지 조정 후 당일 반등.

    과대낙폭반등(하락 종목 역추세)과 다름 — 살아있는 추세의 '쉬어가는 자리' 매수.
    돌파의 거울상: 추격이 아닌 대기 진입이라 손절이 타이트(MA20 하단) → R:R 우위.
    """
    if len(df) < 60:
        return None
    o, close = df["open"], df["close"]
    ma20, ma60 = ind.sma(close, 20), ind.sma(close, 60)
    c, m20, m60 = _last(close), _last(ma20), _last(ma60)
    if c <= 0 or m20 <= 0 or m60 <= 0:              # 거래정지 이력(0원) 가드
        return None
    if not (m20 > m60 and c > m60):                 # 추세 살아있음
        return None
    if not (-0.02 <= c / m20 - 1 <= 0.03):          # MA20 부근(-2%~+3%)
        return None
    hi10 = float(df["high"].iloc[-11:-1].max())
    if hi10 <= 0:
        return None
    pull = c / hi10 - 1
    if not (-0.12 <= pull <= -0.02):                # 직전 고점 대비 -2~-12% 조정
        return None
    if not (c > float(close.iloc[-2]) and c > _last(o)):  # 당일 반등 양봉
        return None
    atr = _last(ind.atr(df))
    vol_up = _last(df["volume"]) > float(df["volume"].iloc[-21:-1].mean())
    strength = 0.6 + (0.1 if vol_up else 0.0)
    return Candidate(
        setup="pullback", side="buy", style="position", session="regular",
        entry_ref=c, atr=atr, support=m20, resistance=hi10,
        strength=min(1.0, strength),
        rationale=["상승 추세 유지(MA20>MA60)", f"고점 대비 {pull:.1%} 조정",
                   "MA20 지지 반등"],
        payload={"ma20": m20, "pullback_pct": pull},
    )


def detect_high_52w(df: pd.DataFrame, lookback: int = 250, vol_mult: float = 1.3) -> Candidate | None:
    """52주 신고가: 1년 신고가 갱신 + 거래량 확인 — 장기 모멘텀(포지션 스타일).

    breakout(20일 박스)과 다른 시간 지평. 신고가 종목은 매물대(손실 보유자)가
    없어 상승 마찰이 적다는 고전적 모멘텀 이상현상.
    """
    if len(df) < lookback + 1:
        return None
    high, close, vol = df["high"], df["close"], df["volume"]
    prior_high = float(high.iloc[-(lookback + 1):-1].max())
    c = _last(close)
    if c <= prior_high:
        return None
    avg_vol = float(vol.iloc[-21:-1].mean())
    if avg_vol > 0 and _last(vol) < avg_vol * vol_mult:
        return None
    atr = _last(ind.atr(df))
    strength = 0.65 + (0.15 if (avg_vol > 0 and _last(vol) > avg_vol * 2) else 0.0)
    return Candidate(
        setup="high_52w", side="buy", style="position", session="regular",
        entry_ref=c, atr=atr, support=prior_high,
        strength=min(1.0, strength),
        rationale=[f"{lookback}일(52주) 신고가 갱신", "거래량 확인"],
        payload={"prior_52w_high": prior_high},
    )


def detect_vol_squeeze(
    df: pd.DataFrame, window: int = 60, squeeze_pct: float = 0.25, vol_mult: float = 1.5,
) -> Candidate | None:
    """변동성 수축 돌파(VCP): 변동성이 바짝 줄어든 뒤 거래량과 함께 20일 고가 돌파.

    수축(에너지 응축) 후 확장은 돌파의 질 좋은 부분집합 — 가짜 돌파 비율이 낮다.
    """
    if len(df) < window + 21:
        return None
    high, close, vol = df["high"], df["close"], df["volume"]
    if _last(close) <= 0:                            # 거래정지 이력(0원) 가드
        return None
    atr_pct = (ind.atr(df) / close.replace(0, pd.NA)).dropna()
    if len(atr_pct) < window:
        return None
    recent = float(atr_pct.iloc[-2])                  # 돌파 전일까지의 수축 상태
    rank = float((atr_pct.iloc[-window:-1] <= recent).mean())
    if rank > squeeze_pct:                            # 최근 변동성이 하위 25% 가 아님
        return None
    prior20 = float(high.iloc[-21:-1].max())
    c = _last(close)
    if c <= prior20:
        return None
    avg_vol = float(vol.iloc[-21:-1].mean())
    if avg_vol > 0 and _last(vol) < avg_vol * vol_mult:
        return None
    atr = _last(ind.atr(df))
    strength = 0.65 + (0.1 if rank <= 0.1 else 0.0)
    return Candidate(
        setup="vol_squeeze", side="buy", style="position", session="regular",
        entry_ref=c, atr=atr, support=prior20,
        strength=min(1.0, strength),
        rationale=[f"변동성 하위 {rank:.0%} 수축", "20일 고가 돌파", "거래량 확인"],
        payload={"squeeze_rank": rank, "breakout_level": prior20},
    )


def detect_flow_accumulation(
    df: pd.DataFrame, flows: pd.DataFrame | None = None,
    window: int = 10, min_pos_days: int = 7,
) -> Candidate | None:
    """수급 동반 매집: 외국인+기관 동반 순매수 누적 + 가격 확인(종가>MA20).

    한국 시장 고유 셋업 — flows(투자자별 순매매) 데이터 필요.
    flows: [date, foreign_net, inst_net] 날짜 오름차순, 현재 봉 이전까지.
    """
    if flows is None or len(flows) < window or len(df) < 20:
        return None
    w = flows.iloc[-window:]
    f_sum = float(w["foreign_net"].fillna(0).sum())
    i_sum = float(w["inst_net"].fillna(0).sum())
    pos_days = int(((w["foreign_net"].fillna(0) + w["inst_net"].fillna(0)) > 0).sum())
    if not (f_sum > 0 and i_sum > 0 and pos_days >= min_pos_days):
        return None
    close = df["close"]
    c, m20 = _last(close), _last(ind.sma(close, 20))
    if c <= m20:                                      # 수급이 가격으로 확인돼야 함
        return None
    atr = _last(ind.atr(df))
    strength = 0.6 + (0.1 if pos_days >= window - 1 else 0.0)
    return Candidate(
        setup="flow_accumulation", side="buy", style="position", session="regular",
        entry_ref=c, atr=atr, support=m20,
        strength=min(1.0, strength),
        rationale=[f"외국인 {window}일 순매수 {f_sum:+,.0f}주",
                   f"기관 {i_sum:+,.0f}주", f"동반 순매수 {pos_days}/{window}일",
                   "MA20 상회(가격 확인)"],
        payload={"foreign_net_sum": f_sum, "inst_net_sum": i_sum,
                 "pos_days": pos_days},
    )


def detect_pead(
    df: pd.DataFrame, earnings: pd.DataFrame | None = None,
    max_age_days: int = 6, min_surprise: float = 0.30,
) -> Candidate | None:
    """PEAD(실적 모멘텀): 어닝 서프라이즈 공시 직후 드리프트 매수.

    공시 후 주가가 정보를 천천히 반영하는 고전적 이상현상 — 강한 YoY
    영업이익 서프라이즈(또는 흑자전환) 공시 후 max_age_days 내 + 가격 확인
    (종가>MA20)일 때 포지션 스타일 진입. earnings: build_earnings_events 산출
    [date, surprise, turnaround] 오름차순.

    point-in-time: '현재'는 마지막 봉의 ts(백테스트) — 라이브 df 에 ts 가
    없으면 오늘 날짜. 공시일 이후의 봉에서만 트리거된다.
    """
    from datetime import date as _date

    if earnings is None or len(earnings) == 0 or len(df) < 20:
        return None
    now = str(df["ts"].iloc[-1])[:10] if "ts" in df.columns else _date.today().isoformat()
    past = earnings[earnings["date"] <= now]
    if past.empty:
        return None
    ev = past.iloc[-1]
    age = (_date.fromisoformat(now) - _date.fromisoformat(str(ev["date"])[:10])).days
    if age > max_age_days:
        return None
    surprise = float(ev["surprise"])
    if surprise < min_surprise:
        return None
    close = df["close"]
    c = _last(close)
    if c <= 0:                                       # 거래정지 이력(0원) 가드
        return None
    m20 = _last(ind.sma(close, 20))
    if m20 <= 0 or c <= m20:                         # 가격 확인: 시장이 받아들이는 중
        return None
    atr = _last(ind.atr(df))
    turnaround = bool(ev.get("turnaround", False))
    strength = min(1.0, 0.6 + min(0.2, surprise * 0.2))
    label = "흑자전환" if turnaround else f"영업이익 YoY {surprise:+.0%}"
    return Candidate(
        setup="pead", side="buy", style="position", session="regular",
        entry_ref=c, atr=atr, support=m20,
        strength=strength,
        rationale=[f"어닝 서프라이즈({label})", f"공시 {age}일 경과", "MA20 상회(가격 확인)"],
        payload={"surprise": surprise, "turnaround": turnaround,
                 "disclosed_at": str(ev["date"])[:10], "fin_period": ev.get("period")},
    )


ALL_DETECTORS = {
    "leader_trend": detect_leader_trend,
    "oversold_bounce": detect_oversold_bounce,
    "breakout": detect_breakout,
    "close_betting": detect_close_betting,
    "pullback": detect_pullback,
    "high_52w": detect_high_52w,
    "vol_squeeze": detect_vol_squeeze,
    "flow_accumulation": detect_flow_accumulation,
    "pead": detect_pead,
}

# 셋업별 '논리적으로 허용되는 스타일'(정체성). 게이트는 이 중 검증 가능한 스타일만 평가하고,
# 통과한 (셋업×스타일) 조합만 발행한다. 같은 셋업이 여러 스타일로 동시 발행될 수 있다.
# - close_betting 은 종가/초단기 정체성이라 day 만 허용 → 일봉으로 검증 불가 → '분봉 검증 대기'.
# - high_52w·pead 는 장기 드리프트라 position 만.
# - mean-reversion(oversold_bounce)은 단/중기라 swing 만.
ALLOWED_STYLES: dict[str, tuple[TradeStyle, ...]] = {
    "leader_trend": ("swing", "position"),
    "oversold_bounce": ("swing",),
    "breakout": ("swing", "position"),
    "close_betting": ("day",),
    "pullback": ("swing", "position"),
    "high_52w": ("position",),
    "vol_squeeze": ("swing", "position"),
    "flow_accumulation": ("swing", "position"),
    "pead": ("position",),
}

# 일봉 OHLCV 로 의미 있게 백테스트 가능한 스타일. day/scalping 은 분봉 필요(2단계).
DAILY_TESTABLE_STYLES: tuple[TradeStyle, ...] = ("swing", "position")


def testable_styles(setup: str) -> tuple[TradeStyle, ...]:
    """해당 셋업에서 '지금(일봉) 게이트로 평가 가능한' 스타일 목록."""
    allowed = ALLOWED_STYLES.get(setup, ())
    return tuple(s for s in allowed if s in DAILY_TESTABLE_STYLES)
