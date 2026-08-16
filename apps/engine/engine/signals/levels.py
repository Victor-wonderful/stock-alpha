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

# ── 최소 손절폭 (방법론 위생) ──
# 손절이 진입가에 붙으면 리스크 분모→0 으로 +50R 급 비현실 트레이드가 생긴다.
# 백테스트와 라이브 시그널이 같은 기준을 쓰도록 단일 출처로 둔다.
MIN_RISK_ATR_MULT = 0.25   # 손절폭 ≥ ¼ATR
MIN_RISK_PCT = 0.001       # 손절폭 ≥ 진입가 0.1%


def min_risk_floor(entry_price: float, atr: float | None) -> float:
    """거래로 인정할 최소 손절폭(가격 단위)."""
    return max(MIN_RISK_ATR_MULT * (atr or 0.0), MIN_RISK_PCT * entry_price)


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


# 구조 손절이 ATR 손절보다 이만큼 넘게 멀면 채택하지 않는다.
# 함수명은 clamp 였지만 실제로는 거리 제한이 없어, 지지선이 멀수록 손절이 멀어졌다.
# 2026-08-14 발행 NHN: ATR 손절 -19.9%(손익비 1.0) 인데 지지선 39,261 을 채택해
# -47.4%(손익비 0.4) 로 발행됐다. 47% 잃고 20% 먹는 계획은 맞아도 손해다.
# 전수 점검(999건): 손절 -20% 초과 82건(8.2%), 손익비 1.0 미만 76건(7.6%).
# 구조는 가까울 때만 의미가 있다. 멀면 그건 손절이 아니라 방치다.
MAX_STRUCT_STOP_ATR_MULT = 1.5

# ── 손절폭 하한 (2026-08-16 추가) ──
# 위 상한은 '너무 먼 손절'을 막았다. 그런데 반대쪽 — **너무 가까운 손절** — 은 막는 게
# 없었다. 지지선이 코앞이면 손절도 코앞이 되고, 그러면 회사에 아무 일이 없어도 평범한
# 하루 등락에 잘려나간다.
#
# 실측(2026-08-16, 픽 111건):
#   손절로 끝난 68건 중 19건(28%)이 **산 지 하루 만에** 손절. 청산까지 중앙값 4일.
#   발행 당시 손절폭은 중앙값 7.6%, 하위 25%는 3.5% — 그런데 우리 유니버스의 평균
#   일중 변동폭이 3.95% 다. 즉 하위 25% 픽은 진입 당일의 정상적인 흔들림만으로 닿는다.
#   목표 도달은 111건 중 3건뿐이었다.
#
# 자사주 매입 셋업이 같은 현상을 깨끗하게 보여줬다 — 공시 후 그냥 20일 들고 있으면
# 승률 81%·+10.9% 인데(event_evidence), 우리 손절 규칙을 씌우면 승률 50%·기대값
# -0.004R 로 무너져 게이트 탈락했다. 신호가 나쁜 게 아니라 손절이 신호를 죽였다.
#
# 그래서 손절은 최소 1×ATR — 하루치 평균 움직임 — 밖에 둔다. 지지선이 그보다 가까우면
# 지지선을 버리는 게 아니라 하한까지 밀어낸다(구조의 의미는 남기되 노이즈는 피한다).
MIN_STOP_ATR_MULT = 1.0

# ── 다만 모든 셋업에 적용하면 안 된다 ──
# 하한을 전 셋업에 걸고 전체 백테스트를 돌린 결과(2026-08-16, 30조합):
#   좋아짐 19 · 나빠짐 10. 추세·돌파 계열은 승률이 5~7%p 올랐고(돌파 29%→35%,
#   칼만 31%→38%), 실적 모멘텀·자사주 매입은 손실에서 이익으로 돌아섰다.
#   반면 바닥을 노리는 계열은 나빠졌다 — 시그마 +0.012→-0.165, 과대낙폭 반등
#   +0.281→+0.174, 기준봉 눌림 +0.188→+0.088.
#
# 이유는 논리에 있다. **역추세·지지 기반 셋업은 "바로 밑이 바닥"이라는 게 진입 근거**다.
# 그 바닥 바로 아래가 손절이어야 논리가 성립하고, 깨지면 즉시 틀린 것이다. 손절을 억지로
# 밀어내면 근거가 사라지고 손실만 커진다. 반대로 추세 셋업은 목표까지 가는 길이 길어
# 도중의 흔들림을 견뎌야 한다 — 거기선 하한이 노이즈를 막아준다.
#
# 그래서 하한은 '추세 계열에만' 건다. 아래 집합은 구조(지지선)를 그대로 존중한다.
STRUCT_FIRST_SETUPS: frozenset[str] = frozenset({
    "sigma", "quantile",                 # 평균회귀 — 밴드 이탈이 곧 오류 신호
    "oversold_bounce", "capitulation",   # 역추세 — 반전 저점이 손절선
    "double_bottom",                     # 쌍바닥 — 두 번째 바닥이 손절선
    "anchor_pullback", "flow_accumulation",  # 지지 매집 — 실측에서 하한 적용 시 악화
    "pivot",                             # 피봇 레벨이 곧 구조
})


def _clamp_stop_to_structure(
    side: str, entry: float, atr_stop: float,
    support: float | None, resistance: float | None,
    atr: float | None = None,
    setup: str | None = None,
) -> float:
    """기술적 지지/저항이 '적당한 거리에 있을 때만' 그 바로 바깥을 손절로 사용.

    · 너무 멀면(ATR 손절 거리의 MAX_STRUCT_STOP_ATR_MULT 배 초과) ATR 손절을 쓴다.
      구조를 따르려다 리스크가 배로 커지는 것을 막는다.
    · 너무 가까우면(1×ATR 미만) 하한까지 밀어낸다. 하루치 움직임 안쪽의 손절은
      논리가 틀렸다는 신호가 아니라 그냥 잡음이다.
      단 STRUCT_FIRST_SETUPS(역추세·지지 기반)는 예외 — 바닥 바로 아래가 손절이어야
      논리가 성립하므로 하한을 걸지 않는다(실측 근거는 위 주석).
    """
    atr_risk = abs(entry - atr_stop)
    limit = atr_risk * MAX_STRUCT_STOP_ATR_MULT
    floor = 0.0 if setup in STRUCT_FIRST_SETUPS else (atr or 0.0) * MIN_STOP_ATR_MULT

    if side == "buy":
        # 매수: 지지 바로 아래를 손절로 (진입보다 낮은 유효 지지일 때)
        if support is not None and support < entry:
            struct = support * 0.999
            dist = entry - struct
            if dist > limit:
                return atr_stop
            # 하한보다 가까우면 하한까지 밀어낸다. 단 ATR 손절보다 멀어지진 않게.
            if dist < floor:
                # 매수 손절은 진입 아래 — 값이 클수록 가깝다. 하한(entry-floor)과
                # ATR 손절 중 '더 가까운 쪽'(=큰 쪽)이 하한을 지키면서 과하지 않다.
                return max(entry - floor, atr_stop)
            return struct
        return atr_stop
    else:
        # 매도: 저항 바로 위를 손절로
        if resistance is not None and resistance > entry:
            struct = resistance * 1.001
            dist = struct - entry
            if dist > limit:
                return atr_stop
            if dist < floor:
                # 매도 손절은 진입 위 — 값이 작을수록 가깝다.
                return min(entry + floor, atr_stop)
            return struct
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
    setup: str | None = None,      # 손절 하한 적용 여부 판단용(STRUCT_FIRST_SETUPS)
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
    stop = _clamp_stop_to_structure(
        side, entry_price, atr_stop, support, resistance, atr=atr, setup=setup,
    )

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
