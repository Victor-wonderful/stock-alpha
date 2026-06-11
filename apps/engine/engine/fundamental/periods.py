"""재무 period 문자열 헬퍼 + YoY 성장률 — 순수 함수.

period 형식: "{연도}{타입}" — 2024FY / 2025Q1 / 2025H1 / 2025Q3 (ingest/dart 참조).

함정 주의: 분기 행이 들어오면 문자열 정렬상 "2026Q1" > "2025FY" 라서
"최신 financials 1행" 방식이 분기 손익을 연간으로 오인한다(PER 4배 왜곡).
→ 레벨 지표(밸류에이션·value/quality 팩터)는 latest_annual(), 성장률은
   같은 보고서 타입의 전년 동기 비교(yoy_growth)만 사용한다.
"""
from __future__ import annotations

import re

_PERIOD_RE = re.compile(r"^(\d{4})(FY|H1|Q1|Q3)$")


def parse_period(period: str | None) -> tuple[int, str] | None:
    """'2025Q1' → (2025, 'Q1'). 형식 불일치는 None."""
    if not period:
        return None
    m = _PERIOD_RE.match(period)
    return (int(m.group(1)), m.group(2)) if m else None


def is_annual(period: str | None) -> bool:
    p = parse_period(period)
    return p is not None and p[1] == "FY"


def prior_same_period(period: str) -> str | None:
    """전년 동기 period — '2026Q1'→'2025Q1', '2025FY'→'2024FY'."""
    p = parse_period(period)
    return f"{p[0] - 1}{p[1]}" if p else None


def latest_annual(rows: list[dict]) -> dict | None:
    """financials 행들 중 최신 연간(FY) 행. 연결(consolidated) 우선."""
    annuals = [r for r in rows if is_annual(r.get("period"))]
    if not annuals:
        return None
    return max(
        annuals,
        key=lambda r: (r["period"], r.get("fs_type") == "consolidated"),
    )


def _yoy(cur: float | None, prev: float | None) -> float | None:
    """YoY 성장률. 기저가 0 이하(적자→흑자 등)면 비율이 무의미 → None."""
    if cur is None or prev is None or prev <= 0:
        return None
    return cur / prev - 1.0


def yoy_growth(rows: list[dict]) -> tuple[float | None, float | None]:
    """(rev_growth, earnings_growth) — 같은 보고서 타입·같은 fs_type 의
    전년 동기 비교. 가장 최신 period 부터 짝이 맞는 것을 찾는다.

    분기 누적/3개월 혼재 문제는 '같은 reprt_code 끼리 비교'로 회피
    (Q1↔Q1, FY↔FY 는 집계 기준이 동일).
    """
    by_key = {
        (r.get("period"), r.get("fs_type")): r
        for r in rows
        if parse_period(r.get("period"))
    }
    # 최신 period 우선 (문자열 정렬이 연도-우선이라 그대로 사용 가능)
    for (period, fs_type), cur in sorted(by_key.items(), reverse=True):
        prior_key = (prior_same_period(period), fs_type)
        prev = by_key.get(prior_key)
        if not prev:
            continue
        rg = _yoy(cur.get("revenue"), prev.get("revenue"))
        eg = _yoy(cur.get("net_income"), prev.get("net_income"))
        if rg is not None or eg is not None:
            return rg, eg
    return None, None
