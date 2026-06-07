"""상대가치 밸류에이션 — peer 멀티플 기반 적정주가."""
from __future__ import annotations

from statistics import median


def peer_implied_price(
    *,
    metric_per_share: float | None,
    peer_multiples: list[float],
    method: str = "median",
) -> float | None:
    """peer 멀티플 중앙값 × 대상 주당지표 = 내재 적정가.

    예) metric_per_share=EPS, peer_multiples=[peer들의 PER] → 내재 주가
        metric_per_share=BPS, peer_multiples=[peer들의 PBR] → 내재 주가
    """
    clean = [m for m in peer_multiples if m is not None and m > 0]
    if metric_per_share is None or metric_per_share <= 0 or not clean:
        return None
    mult = median(clean) if method == "median" else sum(clean) / len(clean)
    return metric_per_share * mult
