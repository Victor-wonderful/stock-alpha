"""시그널 품질 게이트 — 백테스트 성과가 임계를 통과한 셋업만 발행 허용.

docs/PLAN.md: "백테스트 미통과 시그널은 발행 금지".
"""
from __future__ import annotations

from dataclasses import dataclass

from engine.backtest.metrics import (
    Trade,
    avg_rr,
    equity_from_trades,
    expectancy_r,
    max_drawdown,
    win_rate,
)


@dataclass
class GateThresholds:
    min_trades: int = 20          # 표본 수 (과적합·우연 방지)
    min_win_rate: float = 0.40
    min_avg_rr: float = 1.3
    min_expectancy_r: float = 0.0  # 기대값 양수
    max_mdd: float = 0.40


@dataclass
class GateResult:
    passed: bool
    n_trades: int
    win_rate: float | None
    avg_rr: float | None
    expectancy_r: float | None
    mdd: float | None
    reasons: list[str]

    def as_metrics(self) -> dict:
        return {
            "win_rate": _r(self.win_rate),
            "avg_rr": _r(self.avg_rr),
            "mdd": _r(self.mdd),
        }


def _r(v: float | None) -> float | None:
    return None if v is None else round(v, 4)


def evaluate_gate(trades: list[Trade], thr: GateThresholds | None = None) -> GateResult:
    thr = thr or GateThresholds()
    n = len(trades)
    wr = win_rate(trades)
    rr = avg_rr(trades)
    exp = expectancy_r(trades)
    mdd = max_drawdown(equity_from_trades(trades))

    reasons: list[str] = []
    if n < thr.min_trades:
        reasons.append(f"표본 부족({n}<{thr.min_trades})")
    if wr is None or wr < thr.min_win_rate:
        reasons.append(f"승률 미달({wr})")
    if rr is None or rr < thr.min_avg_rr:
        reasons.append(f"손익비 미달({rr})")
    if exp is None or exp < thr.min_expectancy_r:
        reasons.append(f"기대값 음수({exp})")
    if mdd is not None and mdd > thr.max_mdd:
        reasons.append(f"MDD 초과({mdd})")

    return GateResult(
        passed=not reasons, n_trades=n, win_rate=wr, avg_rr=rr,
        expectancy_r=exp, mdd=mdd, reasons=reasons,
    )
