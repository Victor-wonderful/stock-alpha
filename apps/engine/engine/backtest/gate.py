"""시그널 품질 게이트 — 백테스트 성과가 임계를 통과한 셋업만 발행 허용.

docs/PLAN.md: "백테스트 미통과 시그널은 발행 금지".

재캘리브레이션(2026-06-10, 전 유니버스 2,561종목 첫 백테스트 후):
- 승률·손익비 개별 하한 폐지 → **기대값(expectancy_r) 하한으로 통합**.
  승률 33%×손익비 2.5 같은 추세전략은 기대값 +0.16R 우위인데 승률 40%
  하한이 구조적으로 탈락시키는 미캘리브레이션이 있었다. 승률·손익비는
  보고용 지표로 유지.
- MDD 는 ret_pct 전액 순차 복리 곡선(표본↑ → MDD→1 왜곡) 대신
  **R 기준 고정 리스크(1%) 곡선**으로 산출.
- **윈저라이즈(±10R)**: 전 유니버스 진단(2026-06-10)에서 +53R 급 이상치
  소수가 기대값 부호를 뒤집는 것으로 확인(클립 전 +0.045R → 클립 후 -0.018R).
  이상치는 손절폭≈0 인 비현실 트레이드 → 게이트 평가는 클립된 분포로.
- **MDD 실행 모델 = 일별 리스크 예산(daily_r_curve)**: 트레이드당 1% 순차
  복리는 "모든 시그널 전부 집행" 가정 — 같은 날 수십 종목 동시 트리거(군집)
  시 MDD 폭발(시간순 70~99%)·임의 순서면 비결정. 실제 발행(픽 일 5개 상한)과
  일치하는 모델은 하루 리스크 1% 를 그날 진입 시그널에 균등 분할.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from engine.backtest.metrics import (
    Trade,
    avg_rr,
    daily_r_curve,
    expectancy_r,
    max_drawdown,
    win_rate,
)


@dataclass
class GateThresholds:
    min_trades: int = 20            # 표본 수 (과적합·우연 방지)
    min_expectancy_r: float = 0.05  # 트레이드당 기대값(R) — 비용 감안 실질 우위
    max_mdd: float = 0.40           # 일별 리스크예산 곡선(daily_r_curve) 최대 낙폭
    risk_frac: float = 0.01         # 하루 리스크 예산 비율
    winsor_r: float = 10.0          # R 멀티플 클립(±) — 이상치의 기대값 왜곡 차단


@dataclass
class GateResult:
    passed: bool
    n_trades: int
    win_rate: float | None          # 보고용 (하한 아님)
    avg_rr: float | None            # 보고용 (하한 아님)
    expectancy_r: float | None
    mdd: float | None               # R 기준
    reasons: list[str]

    def as_metrics(self) -> dict:
        return {
            "win_rate": _r(self.win_rate),
            "avg_rr": _r(self.avg_rr),
            "mdd": _r(self.mdd),
            "expectancy_r": _r(self.expectancy_r),
        }


def _r(v: float | None) -> float | None:
    return None if v is None else round(v, 4)


def evaluate_gate(trades: list[Trade], thr: GateThresholds | None = None) -> GateResult:
    thr = thr or GateThresholds()
    n = len(trades)
    w = thr.winsor_r
    clipped = [
        replace(t, r_multiple=max(-w, min(w, t.r_multiple))) for t in trades
    ]
    wr = win_rate(clipped)              # 부호 보존 — 클립 영향 없음
    rr = avg_rr(clipped)
    exp = expectancy_r(clipped)
    mdd = max_drawdown(daily_r_curve(clipped, thr.risk_frac))

    reasons: list[str] = []
    if n < thr.min_trades:
        reasons.append(f"표본 부족({n}<{thr.min_trades})")
    if exp is None or exp < thr.min_expectancy_r:
        reasons.append(f"기대값 미달({exp})")
    if mdd is not None and mdd > thr.max_mdd:
        reasons.append(f"R-MDD 초과({mdd})")

    return GateResult(
        passed=not reasons, n_trades=n, win_rate=wr, avg_rr=rr,
        expectancy_r=exp, mdd=mdd, reasons=reasons,
    )
