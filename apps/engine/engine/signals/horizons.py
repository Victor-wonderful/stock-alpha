"""기간 카탈로그 — «전략 × 기간»의 사고파는 규칙 단일 출처.

설계 근거와 전체 그림은 `docs/HORIZON_DESIGN.md`. 요약하면:

  단기  5거래일   시가 시장가 1회      본전스톱   단일 손절
  중기 10거래일   시가 50% + 하락 50%   본전스톱   단일 손절
  장기 20거래일   시가 40% + 40% + 20%  본전스톱   단일 손절

목표가에 닿으면 «파는» 게 아니라 «손절을 본전으로 올린다». 파는 주체는 기간이다
(target_action="trail", 근거는 HorizonProfile.target_action 주석).

기존의 «스타일»(swing 10봉 / position 60봉)을 대체한다. 스타일 배정은 셋업을 만들 때
손으로 적은 값이었고 백테스트로 확인된 적이 없다 — 실제로 position 조합은 30개 중
0개만 게이트를 통과하는데 발행 시그널의 87%가 position 이었다.

## 이 파일이 정하는 것 / 정하지 않는 것

정한다: 기간별 «규칙의 모양»(보유 상한·분할 스펙·목표 유무·손절 배수).
정하지 않는다: **어느 셋업이 어느 기간에 발행되는가.** 그건 백테스트 게이트가 정한다.
  카탈로그에 있다고 발행되는 게 아니라, (셋업 × 기간) 조합이 게이트를 통과해야 나간다.

## 손절을 나누지 않는 이유

손절은 「틀렸다」는 판정이다. 나누면 판정이 흐려지고, «틀렸는데 남아 있는» 상태가 생긴다.
평단 하나에 손절 하나다. 그리고 손절선은 1차 진입 시점에 확정돼 **움직이지 않는다** —
분할이 낮추는 건 평단이지 손절이 아니다. 손절을 평단 따라 내리면 그건 분할 진입이
아니라 손절 폐지다.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Literal

Horizon = Literal["short", "mid", "long"]
HORIZONS: tuple[Horizon, ...] = ("short", "mid", "long")

HORIZON_LABELS: dict[str, str] = {"short": "단기", "mid": "중기", "long": "장기"}

# 기간 → trade_style enum 매핑.
# signals.style 은 enum(scalping/day/swing/position)이라 기간 값을 담을 수 없다.
# 기간 축에서 style 은 **화면 호환용 라벨**일 뿐이고, 손절·목표·보유상한은 전부
# 기간 프로파일이 정한다. 자연키에는 horizon 이 따로 들어가므로(0038) 두 기간이
# 같은 style 로 매핑돼도 서로 덮어쓰지 않는다.
HORIZON_STYLE: dict[str, str] = {"short": "swing", "mid": "swing", "long": "position"}


@dataclass(frozen=True)
class HorizonProfile:
    """한 기간의 매매 규칙."""

    horizon: Horizon
    bars: int
    """보유 상한(거래일). 목표·손절에 안 닿아도 이 날 종가에 판다."""

    stop_atr_mult: float
    """손절 = 진입 − 배수×ATR. 구조(지지선) 당김은 levels.compute_levels 가 처리."""

    scale_in: tuple[tuple[float, float], ...] | None
    """분할 진입 ((비중, ATR 하락배수), ...). 1차가 맨 앞이고 하락배수 0 = 시가 진입.
    None 이면 단일 진입. 2차 이후는 «닿아야» 체결된다 — 안 닿으면 그만큼만 보유한다."""

    scaleout: bool
    """분할 익절 — 1차 목표에서 절반 익절 후 잔량은 본전 손절로 옮겨 2차 목표까지."""

    tp_atr_mults: tuple[float, float, float]
    """목표 = 진입 + 배수×ATR (tp1/tp2/tp3)."""

    target_action: str = "trail"
    """목표가에 «닿았을 때» 무엇을 하는가. 파는 주체는 기간이다.

    "trail" (채택) 팔지 않고 **손절을 평단(본전)으로 올린 뒤 기간까지 보유**한다.
        되돌림은 막고 상방은 안 자른다. 목표가는 화면에 그대로 보여줄 수 있다.
    "sell"  (옛 방식) 목표가에 절반 익절 후 2차까지. 상방이 목표에서 잘린다.

    근거 — 2026-08-21 실험(scripts/exp_holding_horizon, var/holding_horizon_trail.jsonl).
    역추세·돌파·추세 4개 셋업 × 5·10·20일 = **12개 비교에서 예외 없이 trail 이 이겼다.**

        쌍바닥 10일   팔기 +0.183 → 본전스톱 +0.402
        투매소진 10일  팔기 +0.183 → 본전스톱 +0.252
        돌파 10일     팔기 +0.007 → 본전스톱 +0.122
        주도주추세 10일 팔기 +0.013 → 본전스톱 +0.121

    ⚠️ 대가는 승률이다. 본전(±0%)으로 끝나는 거래가 늘어 10일 기준 승률이 5~15%p
    떨어진다(돌파 40.6%→25.2%). 손실이 아니라 무승부가 느는 것이므로 기대값으로
    판단한다([[winrate-vs-expectancy-tradeoff]]).
    """

    @property
    def label(self) -> str:
        return HORIZON_LABELS[self.horizon]

    @property
    def entry_desc(self) -> str:
        """사람이 읽는 진입 설명 — 화면 문구의 단일 출처."""
        if not self.scale_in:
            return "다음 거래일 시가에 전량 매수"
        parts = []
        for w, drop in self.scale_in:
            where = "시가" if drop == 0 else f"−{drop:g}×ATR"
            parts.append(f"{where} {w:.0%}")
        return "다음 거래일 " + " · ".join(parts)


# ── 기간별 기본 프로파일 ────────────────────────────────────────────────────
# ⚠️ 여기 숫자는 «측정 전 기본값»이다. scripts/exp_holding_horizon 결과가 나오면
# 셋업별로 override 한다(아래 SETUP_OVERRIDES). 기본값을 그대로 발행하지 않는다 —
# 게이트를 통과한 조합만 나가므로, 안 맞는 기간은 자연히 걸러진다.
_DEFAULTS: dict[Horizon, HorizonProfile] = {
    "short": HorizonProfile(
        horizon="short", bars=5, stop_atr_mult=1.8,
        scale_in=None,                      # 단기는 나눠 살 시간이 없다
        scaleout=False, tp_atr_mults=(2.0, 3.5, 5.0),
        # 5일 채택 근거(2026-08-21): 투매소진은 2일부터 통과하지만 5일이 승률
        # 60.4%·MDD 12.5% 로 가장 안정적이었다. 1일은 8개 셋업 전부 탈락 —
        # 하루로는 왕복 거래비용(0.31%)을 못 넘는다.
    ),
    "mid": HorizonProfile(
        horizon="mid", bars=10, stop_atr_mult=1.8,
        scale_in=((0.5, 0.0), (0.5, 1.0)),
        scaleout=True, tp_atr_mults=(2.0, 3.5, 5.0),
    ),
    "long": HorizonProfile(
        horizon="long", bars=20, stop_atr_mult=2.5,
        scale_in=((0.4, 0.0), (0.4, 1.0), (0.2, 2.0)),
        scaleout=True, tp_atr_mults=(2.5, 4.5, 7.0),
    ),
}

# 셋업별 조정 — {setup: {horizon: {필드: 값}}}. 백테스트가 근거를 준 것만 넣는다.
# 비워 둔 상태가 정상이다(측정 전). 넣을 때는 반드시 근거(실험 로그·날짜)를 주석에 남긴다.
SETUP_OVERRIDES: dict[str, dict[str, dict]] = {}


def get_profile(horizon: str, setup: str | None = None) -> HorizonProfile:
    """기간(+셋업) → 매매 규칙."""
    if horizon not in _DEFAULTS:
        raise ValueError(f"알 수 없는 기간: {horizon}")
    prof = _DEFAULTS[horizon]
    over = (SETUP_OVERRIDES.get(setup or "") or {}).get(horizon)
    return replace(prof, **over) if over else prof


def backtest_kwargs(prof: HorizonProfile) -> dict:
    """프로파일 → backtest_playbook 인자. 게이트와 라이브가 «같은 규칙»을 쓰게 하는 다리.

    이 함수를 거치지 않고 백테스트를 돌리면 게이트가 재는 규칙과 실제 발행 규칙이
    갈린다 — 그게 2026-08-21 에 고친 결함(게이트는 무조건 체결, 발행은 지정가)의
    정확한 형태다. 새 파라미터를 프로파일에 넣을 때 여기도 함께 넣을 것.
    """
    return {
        "timeout_bars": prof.bars,
        "stop_atr_mult": prof.stop_atr_mult,
        "tp_atr_mults": prof.tp_atr_mults,
        "scale_in": prof.scale_in,
        "scaleout": prof.scaleout,
        "target_action": prof.target_action,
    }


def all_profiles(setup: str | None = None) -> list[HorizonProfile]:
    return [get_profile(h, setup) for h in HORIZONS]
