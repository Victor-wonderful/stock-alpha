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


# 한국 정규장 마감(15:30) + 거래소/KIS·네이버 종가 확정 버퍼.
KR_CLOSE_HHMM = (15, 40)


def kr_session_closed(now: datetime | None = None) -> bool:
    """KST 기준 한국 정규장 종가가 확정됐는지(마감+버퍼 경과 또는 주말).

    장중·장전에 지수 일봉을 조회하면 거래소가 '오늘' 날짜로 직전 종가를 그대로
    내려주는 미확정 행이 섞인다(2026-06-29: morning 08:30 배치가 금 종가를
    월요일 행으로 적재 → 장중 내내 '오늘 보합'처럼 보이는 사고). 종가가 확정되기
    전엔 오늘 날짜 행을 적재하지 않도록 인제스트가 이 가드를 쓴다.
    """
    n = now or kst_now()
    if n.weekday() >= 5:  # 주말은 당일 신규 봉이 없음
        return True
    return (n.hour, n.minute) >= KR_CLOSE_HHMM
