"""거래일·시각 — 항상 KST(UTC+9) 기준. PC 시간대에 의존하지 않는다.

운영 PC 가 모스크바(MSK, UTC+3)라 `date.today()`(PC 로컬)는 KST 와 하루 어긋날 수
있다(MSK 18~24시 = KST 익일). 따라서 as_of 등 **거래일 라벨은 반드시 이 헬퍼**로
KST 계산한다. 워커 스케줄러(`cli.py`의 `timezone(+9)`)·DART 한도가 이미 KST 를 쓰는
것과 통일 — 어디서 돌리든(스케줄·수동·지각 따라잡기) 같은 거래일로 라벨링된다.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))  # 한국은 DST 없음 → 고정 +9


def kst_now() -> datetime:
    """현재 KST 시각(tz-aware)."""
    return datetime.now(KST)


def kst_today() -> date:
    """KST 기준 오늘 날짜 — date.today()(PC 로컬) 대체."""
    return datetime.now(KST).date()
