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
    subperiod_expectancy,
    win_rate,
)


@dataclass
class GateThresholds:
    min_trades: int = 20            # 표본 수 (과적합·우연 방지)
    # 트레이드당 기대값(R) 하한. 2026-06-13 이후 expectancy_r 은 거래비용 차감 net
    # (engine/backtest/costs.py) → 이 값은 '비용 대용'이 아니라 net 위에 얹는
    # 순수 과적합/안전 마진. 비용을 명시 차감하므로 net 기준 양의 마진이면 실거래 우위.
    min_expectancy_r: float = 0.05
    max_mdd: float = 0.40           # 일별 리스크예산 곡선(daily_r_curve) 최대 낙폭
    risk_frac: float = 0.01         # 하루 리스크 예산 비율
    winsor_r: float = 10.0          # R 멀티플 클립(±) — 이상치의 기대값 왜곡 차단
    # 워크포워드(하위기간 지속성) — 전 구간 기대값이 한 시기에서만 나왔는지 검증.
    # 자격 하위기간(표본 충분)이 2개 미만이면 평가 불가 → 무력화(전체 게이트가 판정).
    # 즉 데이터가 충분한 셋업에 한해 게이트를 '더 엄격하게만' 만든다(느슨하게 X).
    wf_enabled: bool = True
    wf_folds: int = 4               # 진입일 기준 시간 균등 분할 수
    wf_min_fold_trades: int = 6     # 하위기간을 평가에 포함시킬 최소 표본
    wf_min_positive_frac: float = 0.5   # 자격 하위기간 중 양의 기대값 비율 하한
    wf_recent_floor: float = 0.0    # 가장 최근 자격 하위기간 기대값(R) 하한 — 엣지 쇠퇴 차단


@dataclass
class GateResult:
    passed: bool
    n_trades: int
    win_rate: float | None          # 보고용 (하한 아님)
    avg_rr: float | None            # 보고용 (하한 아님)
    expectancy_r: float | None
    mdd: float | None               # R 기준
    reasons: list[str]
    walkforward: dict | None = None  # 하위기간 지속성 진단(folds·판정) — backtests 적재·UI용

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
    wf = _walkforward(clipped, thr) if thr.wf_enabled else None

    reasons: list[str] = []
    if n < thr.min_trades:
        reasons.append(f"표본 부족({n}<{thr.min_trades})")
    if exp is None or exp < thr.min_expectancy_r:
        reasons.append(f"기대값 미달({exp})")
    if mdd is not None and mdd > thr.max_mdd:
        reasons.append(f"R-MDD 초과({mdd})")
    if wf is not None and not wf["ok"]:
        reasons.append(f"워크포워드 불안정({wf['reason']})")

    return GateResult(
        passed=not reasons, n_trades=n, win_rate=wr, avg_rr=rr,
        expectancy_r=exp, mdd=mdd, reasons=reasons, walkforward=wf,
    )


def _walkforward(trades: list[Trade], thr: GateThresholds) -> dict:
    """하위기간 지속성 판정 (순수). clipped 트레이드 기준.

    자격 하위기간(표본 >= wf_min_fold_trades)이 2개 미만이면 평가 불가 →
    ok=True(무력). 자격 하위기간 과반이 양(+)이고 가장 최근 자격 하위기간이
    wf_recent_floor 이상이어야 통과. 게이트를 더 엄격하게만 만든다.
    """
    folds = subperiod_expectancy(trades, thr.wf_folds)
    qualifying = [
        f for f in folds
        if f["n"] >= thr.wf_min_fold_trades and f["expectancy_r"] is not None
    ]
    if len(qualifying) < 2:
        return {"ok": True, "reason": None, "evaluable": False,
                "folds": folds, "n_qualifying": len(qualifying)}
    pos = sum(1 for f in qualifying if f["expectancy_r"] > 0)
    frac = pos / len(qualifying)
    recent = float(qualifying[-1]["expectancy_r"])
    ok = frac >= thr.wf_min_positive_frac and recent >= thr.wf_recent_floor
    reason = None
    if not ok:
        parts = []
        if frac < thr.wf_min_positive_frac:
            parts.append(f"양의기간 {pos}/{len(qualifying)}")
        if recent < thr.wf_recent_floor:
            parts.append(f"최근기간 {recent:+.3f}R")
        reason = ", ".join(parts)
    return {
        "ok": ok, "reason": reason, "evaluable": True,
        "folds": folds, "n_qualifying": len(qualifying),
        "positive_frac": round(frac, 3), "recent_expectancy_r": round(recent, 4),
    }
