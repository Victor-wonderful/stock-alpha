"""거래비용 모델 — 백테스트 R/수익률에 수수료·세금·슬리피지 반영.

docs/PLAN.md 시그널 품질 게이트의 전제는 "백테스트 미통과 시그널 발행 금지"인데,
지금까지 백테스트는 **비용을 전혀 반영하지 않았다**(gross R). 기대값 +0.05~0.07R 셋업은
라운드트립 비용(≈0.4%)을 빼면 소멸할 수 있어, 비용 미반영 게이트는 '거짓 통과'를
낼 위험이 있었다. 이 모듈이 그 비용을 명시적으로 차감한다.

한국 주식 현물·롱온리 기준:
- 위탁수수료(commission): 매수·매도 양변. 온라인 ~0.015%/변(증권사별 상이).
- 증권거래세(tax): 매도에만. 2025 코스피 ~0.15%·코스닥 0.18%(농특세 포함). 보수적 0.18%.
- 슬리피지(slippage): 호가 갭·체결 미끄러짐. 유동 유니버스(거래대금 10억+) 보수적 0.10%/변.

R(리스크 배수) = 순손익 / 계획 리스크(entry-stop). 비용은 순손익에서 차감 →
'계획 리스크 대비 실현 순R'. 라운드트립 ≈ 0.4% → 손절폭 6%면 트레이드당 ~0.067R 잠식.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CostModel:
    """변(side)당 비율 비용. 모두 가격 대비 소수(0.0015 = 0.15%)."""

    commission_pct: float = 0.00015  # 위탁수수료 (변당, 0.015%)
    tax_pct: float = 0.0018          # 증권거래세 (매도에만, 0.18%)
    slippage_pct: float = 0.0005     # 슬리피지 (변당, 0.05% — 유동 유니버스 10억+ 기준)

    def net_pnl(self, entry: float, exit_price: float) -> float:
        """주당 순손익 — 슬리피지·수수료·거래세 차감(롱: 매수→매도).

        매수는 슬리피지만큼 불리하게(위로), 매도는 불리하게(아래로) 체결된다고 가정.
        """
        buy = entry * (1.0 + self.slippage_pct)
        sell = exit_price * (1.0 - self.slippage_pct)
        commission = (entry + exit_price) * self.commission_pct
        tax = exit_price * self.tax_pct
        return (sell - buy) - commission - tax

    def round_trip_cost(self, entry: float, exit_price: float) -> float:
        """라운드트립 총비용(주당, 양수) = gross - net."""
        return (exit_price - entry) - self.net_pnl(entry, exit_price)


# 비용 미반영(gross) — 진단/비교용.
ZERO_COST = CostModel(commission_pct=0.0, tax_pct=0.0, slippage_pct=0.0)


def default_cost_model() -> CostModel:
    """설정(.env)으로 비율을 덮어쓸 수 있는 기본 비용 모델 — 캘리브레이션용."""
    from engine.config import get_settings

    s = get_settings()
    return CostModel(
        commission_pct=getattr(s, "backtest_commission_pct", CostModel.commission_pct),
        tax_pct=getattr(s, "backtest_tax_pct", CostModel.tax_pct),
        slippage_pct=getattr(s, "backtest_slippage_pct", CostModel.slippage_pct),
    )
