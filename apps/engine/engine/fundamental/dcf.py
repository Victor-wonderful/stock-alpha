"""DCF 밸류에이션 — 순수 함수.

2단계 모델: 명시적 예측기간(고성장) + 영구성장 터미널.
주당 적정가치 = (예측 FCF 현가 합 + 터미널 현가 - 순부채) / 발행주식수
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DcfResult:
    intrinsic_per_share: float
    enterprise_value: float
    equity_value: float
    pv_explicit: float
    pv_terminal: float

    def as_dict(self) -> dict:
        return {
            "dcf_value": round(self.intrinsic_per_share, 4),
            "enterprise_value": round(self.enterprise_value, 2),
            "equity_value": round(self.equity_value, 2),
        }


def dcf_value(
    *,
    fcf0: float,
    shares: float,
    wacc: float,
    growth: float,
    years: int = 5,
    terminal_growth: float = 0.02,
    net_debt: float = 0.0,
) -> DcfResult:
    """2단계 DCF.

    fcf0: 기준 연도 FCF
    wacc: 할인율 (예: 0.09)
    growth: 명시적 기간 연성장률
    terminal_growth: 영구성장률 (wacc 보다 작아야 함)
    """
    if shares <= 0:
        raise ValueError("shares 는 양수여야 합니다.")
    if wacc <= terminal_growth:
        raise ValueError("wacc 는 terminal_growth 보다 커야 합니다.")
    if years < 1:
        raise ValueError("years >= 1")

    pv_explicit = 0.0
    fcf = fcf0
    last_fcf = fcf0
    for t in range(1, years + 1):
        fcf = fcf * (1 + growth)
        pv_explicit += fcf / ((1 + wacc) ** t)
        last_fcf = fcf

    # 터미널: 마지막 예측 FCF 다음 해부터 영구성장
    terminal_value = last_fcf * (1 + terminal_growth) / (wacc - terminal_growth)
    pv_terminal = terminal_value / ((1 + wacc) ** years)

    enterprise_value = pv_explicit + pv_terminal
    equity_value = enterprise_value - net_debt
    intrinsic = equity_value / shares

    return DcfResult(
        intrinsic_per_share=intrinsic,
        enterprise_value=enterprise_value,
        equity_value=equity_value,
        pv_explicit=pv_explicit,
        pv_terminal=pv_terminal,
    )


def upside_pct(intrinsic: float | None, price: float | None) -> float | None:
    """(적정가 - 현재가) / 현재가."""
    if intrinsic is None or price is None or price == 0:
        return None
    return (intrinsic - price) / price
