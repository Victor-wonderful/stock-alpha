"""재무비율 + 밸류에이션 멀티플 — 순수 함수.

financials 행(절대 금액)과 시장 데이터(가격/주식수)로 비율을 산출한다.
값이 없거나 분모 0이면 None 을 반환(안전).
"""
from __future__ import annotations

from typing import Any


def _safe_div(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return a / b


def compute_ratios(
    fin: dict[str, Any],
    price: float | None = None,
    shares: float | None = None,
    ebitda: float | None = None,
    net_debt: float | None = None,
) -> dict[str, float | None]:
    """재무비율·밸류에이션 멀티플 산출.

    fin: financials 행 (revenue, op_income, net_income, assets, equity, debt, eps, bps, ocf ...)
    price/shares: 시장가·발행주식수 (멀티플 계산용)
    """
    rev = fin.get("revenue")
    op = fin.get("op_income")
    ni = fin.get("net_income")
    eq = fin.get("equity")
    debt = fin.get("debt")
    eps = fin.get("eps")
    bps = fin.get("bps")

    # EPS/BPS 가 없고 주식수가 있으면 도출
    if eps is None and shares:
        eps = _safe_div(ni, shares)
    if bps is None and shares:
        bps = _safe_div(eq, shares)

    out: dict[str, float | None] = {
        "roe": _safe_div(ni, eq),
        "op_margin": _safe_div(op, rev),
        "net_margin": _safe_div(ni, rev),
        "debt_ratio": _safe_div(debt, eq),
        "per": _safe_div(price, eps),
        "pbr": _safe_div(price, bps),
        "ev_ebitda": None,
    }

    # EV/EBITDA = (시총 + 순부채) / EBITDA
    if price is not None and shares and ebitda:
        mktcap = price * shares
        ev = mktcap + (net_debt or 0.0)
        out["ev_ebitda"] = _safe_div(ev, ebitda)

    return out
