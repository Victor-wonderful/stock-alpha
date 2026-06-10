"""백테스트 성과 지표 — 순수 함수.

핵심 단위는 'R'(리스크 배수): 트레이드 손익을 진입~손절 거리로 나눈 값.
R>0=수익, R<0=손실. R 기반이면 종목·가격대 무관하게 합산 가능.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class Trade:
    r_multiple: float          # 손익 / 리스크
    ret_pct: float             # 손익률 (포지션 대비)
    bars_held: int
    entry_ts: str = ""         # 진입 시점(ISO) — 전 종목 합산 시 시간순 정렬용.
                               # MDD 는 순서 민감 → 임의(DB 행) 순서면 런마다 값이
                               # 흔들린다. 시간순이 실제 포트폴리오 시퀀스.


def win_rate(trades: list[Trade]) -> float | None:
    if not trades:
        return None
    wins = sum(1 for t in trades if t.r_multiple > 0)
    return wins / len(trades)


def avg_rr(trades: list[Trade]) -> float | None:
    """평균 손익비 = 평균이익 / 평균손실(절대값)."""
    wins = [t.r_multiple for t in trades if t.r_multiple > 0]
    losses = [-t.r_multiple for t in trades if t.r_multiple < 0]
    if not wins or not losses:
        return None
    avg_win = sum(wins) / len(wins)
    avg_loss = sum(losses) / len(losses)
    return avg_win / avg_loss if avg_loss > 0 else None


def expectancy_r(trades: list[Trade]) -> float | None:
    """기대값(R) = 평균 R 멀티플. 양수면 기대수익 우위."""
    if not trades:
        return None
    return sum(t.r_multiple for t in trades) / len(trades)


def sharpe(returns: list[float], periods_per_year: int = 252) -> float | None:
    """수익률 시퀀스의 연율화 Sharpe (무위험수익률 0 가정)."""
    n = len(returns)
    if n < 2:
        return None
    mean = sum(returns) / n
    var = sum((r - mean) ** 2 for r in returns) / (n - 1)
    std = math.sqrt(var)
    if std == 0:
        return None
    return (mean / std) * math.sqrt(periods_per_year)


def max_drawdown(equity_curve: list[float]) -> float | None:
    """최대 낙폭(0~1, 양수). equity_curve 는 누적 자산 시퀀스."""
    if not equity_curve:
        return None
    peak = equity_curve[0]
    mdd = 0.0
    for v in equity_curve:
        peak = max(peak, v)
        if peak > 0:
            dd = (peak - v) / peak
            mdd = max(mdd, dd)
    return mdd


def equity_from_trades(trades: list[Trade], start: float = 1.0) -> list[float]:
    """트레이드 수익률을 복리로 누적한 자산 곡선."""
    eq = [start]
    for t in trades:
        eq.append(eq[-1] * (1 + t.ret_pct))
    return eq


def equity_r_curve(
    trades: list[Trade], risk_frac: float = 0.01, start: float = 1.0
) -> list[float]:
    """R 기준 자산 곡선 — 트레이드당 자산의 risk_frac 만 리스크(고정 분할).

    ret_pct 복리 곡선은 전 종목 트레이드를 전액 순차 복리로 가정해 표본이
    커질수록 MDD 가 1로 수렴(방법론 왜곡). 트레이드당 리스크를 고정하면
    MDD 가 전략 품질을 반영하고 종목·표본 수와 무관하게 비교 가능.
    """
    eq = [start]
    for t in trades:
        eq.append(eq[-1] * (1 + risk_frac * t.r_multiple))
    return eq


def daily_r_curve(
    trades: list[Trade], risk_frac: float = 0.01, start: float = 1.0
) -> list[float]:
    """일별 리스크 예산 자산 곡선 — 하루 risk_frac 을 그날 진입 트레이드에 균등 분할.

    실행 모델 정정(2026-06-10): 같은 셋업이 같은 날 수십 종목에서 동시
    트리거되는데, 트레이드당 1% 순차 복리는 "모든 시그널을 전부 받는" 가정이라
    손실 군집일에 MDD 가 폭발한다(시간순 정렬 후 70~99%). 실제 구독자/픽은
    하루 소수만 집행 → 하루 손익(R) = 그날 트레이드 R 평균, 하루 리스크는
    risk_frac 고정. 진입일 기준 근사(보유기간 중 분산은 무시 — 보수적 군집 유지).
    entry_ts 없는 트레이드는 단일 일자로 묶인다.
    """
    by_day: dict[str, list[float]] = {}
    for t in trades:
        by_day.setdefault(t.entry_ts[:10], []).append(t.r_multiple)
    eq = [start]
    for day in sorted(by_day):
        rs = by_day[day]
        eq.append(eq[-1] * (1 + risk_frac * (sum(rs) / len(rs))))
    return eq


def information_coefficient(scores: list[float], fwd_returns: list[float]) -> float | None:
    """팩터 점수 vs 미래수익률 스피어만 상관(IC)."""
    if len(scores) != len(fwd_returns) or len(scores) < 3:
        return None
    rs = _rank(scores)
    rr = _rank(fwd_returns)
    return _pearson(rs, rr)


def _rank(xs: list[float]) -> list[float]:
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(xs):
        j = i
        while j + 1 < len(xs) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        avg = (i + j) / 2.0
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def _pearson(a: list[float], b: list[float]) -> float | None:
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    cov = sum((a[i] - ma) * (b[i] - mb) for i in range(n))
    va = math.sqrt(sum((x - ma) ** 2 for x in a))
    vb = math.sqrt(sum((x - mb) ** 2 for x in b))
    if va == 0 or vb == 0:
        return None
    return cov / (va * vb)
