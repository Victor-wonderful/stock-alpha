"""어닝 서프라이즈 이벤트 — financials 행 → PEAD 트리거 입력 (순수 함수).

서프라이즈 정의(애널리스트 컨센서스 부재 → YoY 기반):
  · 같은 보고서 타입(Q1↔Q1, FY↔FY)·같은 fs_type 의 전년 동기 영업이익 비교
    (영업이익 우선 — 순이익은 일회성 손익 노이즈가 큼. 없으면 순이익 폴백)
  · 기저 > 0: surprise = cur/prev - 1
  · 기저 ≤ 0 < cur: 흑자전환 — surprise = 1.0 (강한 이벤트로 간주)
  · cur ≤ 0: 이벤트 없음 (매수 사이드만 운용)

point-in-time 정직성: 이벤트 날짜는 회계 기간이 아니라 **공시일(disclosed_at,
DART 접수일)** — 시장이 숫자를 처음 본 날 이후에만 트리거할 수 있다.
disclosed_at 없는 행(과거 인제스트분)은 이벤트에서 제외(추정 금지).
"""
from __future__ import annotations

from engine.fundamental.periods import parse_period, prior_same_period

TURNAROUND_SURPRISE = 1.0


def _earn(row: dict) -> float | None:
    """이벤트 판정에 쓸 이익 — 영업이익 우선, 없으면 순이익."""
    v = row.get("op_income")
    return v if v is not None else row.get("net_income")


def build_earnings_events(fin_rows: list[dict]) -> list[dict]:
    """단일 종목 financials 행들 → 공시일 오름차순 서프라이즈 이벤트 리스트.

    반환 행: {date, surprise, turnaround, period, rev_growth}
    """
    by_key = {
        (r.get("period"), r.get("fs_type")): r
        for r in fin_rows
        if parse_period(r.get("period"))
    }
    events: list[dict] = []
    for (period, fs_type), cur in by_key.items():
        disclosed = cur.get("disclosed_at")
        if not disclosed:
            continue  # 공시일 모름 → point-in-time 불가 → 제외
        prev = by_key.get((prior_same_period(period), fs_type))
        if prev is None:
            continue
        c, p = _earn(cur), _earn(prev)
        if c is None or p is None or c <= 0:
            continue
        if p > 0:
            surprise = c / p - 1.0
            turnaround = False
        else:  # p <= 0 < c — 흑자전환
            surprise = TURNAROUND_SURPRISE
            turnaround = True
        rev_c, rev_p = cur.get("revenue"), prev.get("revenue")
        rev_growth = (
            rev_c / rev_p - 1.0
            if (rev_c is not None and rev_p is not None and rev_p > 0)
            else None
        )
        events.append({
            "date": str(disclosed)[:10],
            "surprise": round(float(surprise), 4),
            "turnaround": turnaround,
            "period": period,
            "rev_growth": round(rev_growth, 4) if rev_growth is not None else None,
        })
    events.sort(key=lambda e: e["date"])
    return events
