"""market_calendar 읽기 — 순수 계산(calendar.py)과 DB 접근을 분리.

소비처(리포트·픽 선정)는 여기서 읽고 calendar.py 의 순수 함수로 판정한다.
캘린더가 비어 있어도 조용히 빈 값을 돌려준다 — 캘린더는 보조 장치라서, 없다고
발행이 멈추면 안 된다(graceful).
"""
from __future__ import annotations

from datetime import date, timedelta

from engine.db import get_client
from engine.logging import get_logger

log = get_logger(__name__)


def load_holidays(start: date | None = None, end: date | None = None) -> set[date]:
    """휴장일 집합. 기본 구간은 오늘 기준 ±1년."""
    from engine.timeutil import kst_today

    today = kst_today()
    lo = start or (today - timedelta(days=365))
    hi = end or (today + timedelta(days=365))
    try:
        rows = (
            get_client().table("market_calendar").select("date")
            .eq("kind", "holiday")
            .gte("date", lo.isoformat()).lte("date", hi.isoformat())
            .limit(2000).execute()
        ).data or []
    except Exception as e:  # 캘린더 없이도 배치는 돈다
        log.warning("calendar.holidays.unavailable", err=str(e))
        return set()
    return {date.fromisoformat(r["date"]) for r in rows if r.get("date")}


def load_events(start: date, end: date,
                instrument_ids: list[int] | None = None) -> list[dict]:
    """구간 내 이벤트 행(휴장 제외).

    instrument_ids 를 주면 시장 전체 이벤트 + 그 종목들의 이벤트를 함께 가져온다.
    (종목 이벤트는 아직 적재하는 소스가 없다 — 스키마만 준비돼 있다.)
    """
    try:
        q = (
            get_client().table("market_calendar")
            .select("date,kind,title,region,instrument_id,severity,"
                    "block_entry,block_days_before")
            .neq("kind", "holiday")
            .gte("date", start.isoformat()).lte("date", end.isoformat())
            .order("date").limit(1000)
        )
        rows = q.execute().data or []
    except Exception as e:
        log.warning("calendar.events.unavailable", err=str(e))
        return []
    if instrument_ids is None:
        return rows
    allow = set(instrument_ids)
    return [r for r in rows
            if r.get("instrument_id") is None or r["instrument_id"] in allow]
