"""시장 캘린더 적재 — 휴장일(pykrx) + 계산 이벤트 + 손으로 채운 시드 파일.

krx.py 와 같은 설계: 네트워크(fetch_*)와 변환(순수 함수)을 나눈다. 계산 규칙은
engine.market.calendar 에 있고 여기는 조립·적재만 한다.

휴장일은 거래소가 "쉬는 날" 목록을 주지 않으므로 **지수 일봉이 있는 날 = 거래일**로
보고 그 여집합을 역산한다. 그래서 과거는 정확하고, 미래는 아직 봉이 없어 알 수 없다 —
미래 휴장일은 연초에 거래소 휴장일정이 나오면 시드 파일로 보완한다.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import pandas as pd

from engine.db import upsert
from engine.logging import get_logger
from engine.market import calendar as cal
from engine.timeutil import kst_today

log = get_logger(__name__)

KOSPI_INDEX = "1001"  # pykrx 코스피 지수 코드

SEED_FILE = Path(__file__).resolve().parents[2] / "data" / "calendar_events.json"


# ── 네트워크 fetch (pykrx 지연 import) ──

def fetch_index_dates(fromdate: str, todate: str) -> pd.DataFrame:
    """코스피 지수 일봉. 인덱스가 곧 거래일 목록. 날짜는 'YYYYMMDD'.

    2026 현재 이 엔드포인트는 빈 응답을 낸다(krx.py `_safe_krx` 와 같은 이슈).
    그래서 주 경로가 아니라 ohlcv 가 비었을 때의 폴백이다.
    """
    from pykrx import stock  # lazy

    try:
        df = stock.get_index_ohlcv(fromdate, todate, KOSPI_INDEX)
    except (KeyError, ValueError) as e:  # pykrx 내부 빈응답 파싱 실패
        log.warning("calendar.index.fetch_failed", err=str(e))
        return pd.DataFrame()
    return df if df is not None else pd.DataFrame()


def fetch_trading_dates(start: date, end: date) -> set[date]:
    """거래일 집합 — 우리 ohlcv 가 주 경로, pykrx 지수는 폴백.

    일봉이 있는 날 = 거래가 있던 날. 매일 전 종목 일봉을 적재하고 있으므로 외부
    호출 없이 과거 거래일을 정확히 안다. 미래는 당연히 알 수 없다(휴장일 역산은
    오늘까지만).
    """
    from engine import db_direct

    if db_direct.available():
        try:
            iso = db_direct.trading_dates_1d(start.isoformat(), end.isoformat())
            if iso:
                return {date.fromisoformat(s) for s in iso}
            log.warning("calendar.trading_dates.empty_ohlcv")
        except Exception as e:  # DSN 있는데 실패 → pykrx 로 내려간다
            log.warning("calendar.trading_dates.db_failed", err=str(e))
    return traded_dates(
        fetch_index_dates(start.strftime("%Y%m%d"), end.strftime("%Y%m%d"))
    )


def traded_dates(df: pd.DataFrame) -> set[date]:
    """지수 일봉 DataFrame → 거래일 집합. (순수 함수)"""
    if df is None or df.empty:
        return set()
    return {pd.Timestamp(idx).date() for idx in df.index}


# ── 시드 파일 ──

def seed_rows(payload: dict) -> list[dict]:
    """시드 파일 dict → 캘린더 행. 잘못된 항목은 버리고 로그만 남긴다. (순수 함수)"""
    out: list[dict] = []
    for item in payload.get("events") or []:
        d = cal._as_date(item.get("date"))
        title = (item.get("title") or "").strip()
        kind = (item.get("kind") or "").strip()
        if not (d and title and kind):
            log.warning("calendar.seed.skip", item=item)
            continue
        # 같은 날 같은 종류가 여럿일 수 있으니 제목까지 키에 넣는다(순서 무관·결정적).
        h = hashlib.sha1(title.encode("utf-8")).hexdigest()[:8]
        out.append({
            "date": d.isoformat(),
            "event_key": f"seed-{kind}-{d:%Y-%m-%d}-{h}",
            "kind": kind,
            "title": title,
            "region": item.get("region") or "KR",
            "severity": int(item.get("severity") or 1),
            "block_entry": bool(item.get("block_entry")),
            "block_days_before": min(int(item.get("block_days_before") or 0),
                                     cal.MAX_BLOCK_DAYS),
            "source": item.get("source") or "seed-file",
        })
    return out


def seed_holidays(payload: dict) -> tuple[list[date], date | None]:
    """시드 파일의 **미래 휴장일** 과 확정 기한. (순수 함수)

    역산은 과거만 안다 — 일봉이 없는 미래를 휴장이라 할 수는 없다. 그런데 정작
    필요한 건 미래다("다음 거래일이 언제냐"). 거래소가 연초에 내는 휴장일정을 여기
    붙여넣으면 그때부터 화면이 날짜를 단정할 수 있다.

    holidays_confirmed_through: 이 날짜까지는 휴장 목록이 완전하다는 사람의 선언.
    소비처는 이 기한 안에서만 거래일을 단정한다(없으면 계속 "다음 거래일"로 흐린다).
    """
    out: list[date] = []
    for s in payload.get("holidays") or []:
        d = cal._as_date(s)
        if d:
            out.append(d)
        else:
            log.warning("calendar.seed.bad_holiday", value=s)
    through = cal._as_date(payload.get("holidays_confirmed_through"))
    return sorted(set(out)), through


def not_holidays(payload: dict) -> set[date]:
    """휴장 역산을 뒤집는 수동 예외 — "이 날은 장이 열렸다". (순수 함수)

    역산은 '일봉이 없는 평일 = 휴장'인데, 인제스트가 끝내 못 채운 날과 진짜 휴장이
    구분되지 않는다. 사람이 확인해서 바로잡을 구멍을 남겨둔다.
    """
    out: set[date] = set()
    for s in payload.get("not_holidays") or []:
        d = cal._as_date(s)
        if d:
            out.add(d)
        else:
            log.warning("calendar.seed.bad_not_holiday", value=s)
    return out


def _read_seed(path: Path | None = None) -> dict:
    p = path or SEED_FILE
    if not p.exists():
        log.info("calendar.seed.absent", path=str(p))
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        log.warning("calendar.seed.invalid_json", path=str(p), err=str(e))
        return {}


def load_seed_file(path: Path | None = None) -> list[dict]:
    return seed_rows(_read_seed(path))


# ── 적재 ──

def _to_row(e: dict) -> dict:
    r = dict(e)
    if isinstance(r.get("date"), date):
        r["date"] = r["date"].isoformat()
    return r


def _resync_holidays(holidays: list[date], start: date, end: date) -> int:
    """역산 대상 구간의 휴장일을 계산 결과와 일치시킨다. 삭제 건수 반환.

    구간은 **역산을 시도한 범위**(start~end)여야 한다. 결과의 min/max 로 잡으면
    "이제 휴장이 아니게 된" 바깥 구간의 옛 행이 살아남는다 — 초기 적재의 유령
    휴장일 209건이 정확히 그렇게 남았다. 미래(end 이후)는 손대지 않는다.
    """
    lo, hi = start.isoformat(), end.isoformat()
    keep = {d.isoformat() for d in holidays}
    from engine.db import get_client

    client = get_client()
    existing = (
        client.table("market_calendar").select("id,date")
        .eq("kind", "holiday").gte("date", lo).lte("date", hi)
        .limit(2000).execute()
    ).data or []
    stale = [r["id"] for r in existing if str(r["date"]) not in keep]
    for i in range(0, len(stale), 200):
        client.table("market_calendar").delete().in_("id", stale[i:i + 200]).execute()
    if stale:
        log.info("calendar.holidays.resync", removed=len(stale), window=[lo, hi])
    return len(stale)


def ingest_calendar(years_back: int = 2, years_ahead: int = 1) -> dict[str, int]:
    """휴장일 역산 + 계산 이벤트 + 시드 파일을 market_calendar 에 적재.

    반환: 종류별 적재 건수. 재실행해도 (date, event_key) 로 갱신된다.
    """
    today = kst_today()
    start = date(today.year - years_back, 1, 1)
    end = date(today.year + years_ahead, 12, 31)

    payload = _read_seed()

    # 1) 휴장일 — 과거~오늘 구간만 역산할 수 있다(미래는 봉이 없다).
    traded = fetch_trading_dates(start, today)
    holidays = cal.holidays_from_trading_days(traded, start, today)
    override = not_holidays(payload)
    if override:
        before = len(holidays)
        holidays = [d for d in holidays if d not in override]
        log.info("calendar.holidays.override", removed=before - len(holidays))
    if not traded:
        log.warning("calendar.holidays.empty",
                    hint="ohlcv·pykrx 모두 비었다 — 휴장일 역산 생략")

    # 1b) 사람이 확인한 휴장일(주로 미래) — 역산이 닿지 않는 구간을 메운다.
    # 역산은 과거만 안다. 그런데 정작 필요한 건 미래다("다음 거래일이 언제냐").
    manual, confirmed_through = seed_holidays(payload)
    holidays = sorted(set(holidays) | set(manual))
    if confirmed_through is None:
        log.warning(
            "calendar.holidays.unconfirmed",
            hint="holidays_confirmed_through 없음 — 화면은 '다음 거래일'로 흐리게 둔다",
        )
    hol_set = set(holidays)

    # 2) 계산 이벤트 — 만기·리밸런싱은 휴장일을 알아야 직전 거래일로 당길 수 있다.
    computed: list[dict] = []
    for y in range(start.year, end.year + 1):
        computed.extend(cal.computed_events(y, hol_set))

    # 3) 손으로 채운 정책 일정
    seeded = seed_rows(payload)
    if not seeded:
        log.warning(
            "calendar.seed.empty",
            hint="FOMC·금통위·CPI 는 계산할 수 없다 — data/calendar_events.json 을 채워야 한다",
        )

    # 휴장 확정 기한 마커 — "이 날짜까지는 휴장 목록이 완전하다"는 한 줄.
    # 소비처(웹)는 이 기한 안에서만 거래일을 단정한다. 마커가 없으면 흐리게 둔다.
    marker = [{
        "date": confirmed_through.isoformat(),
        "event_key": "holiday-coverage",
        "kind": "coverage",
        "title": "휴장일정 확정 기한",
        "region": "KR",
        "severity": 1,
        "block_entry": False,
        "block_days_before": 0,
        "source": "seed-file",
    }] if confirmed_through else []

    rows = [_to_row(e) for e in
            (cal.holiday_rows(holidays) + computed + seeded + marker)]
    # 배치 내 키 중복 제거 — 같은 키가 한 번에 두 번 오면 Postgres 가 21000 으로 거부.
    uniq: dict[str, dict] = {r["event_key"]: r for r in rows}
    rows = list(uniq.values())

    # 휴장일은 업서트만으로는 못 고친다 — 역산 규칙이 바뀌어 "휴장이 아니게 된" 날은
    # 지워줘야 한다(초기 적재 때 ohlcv 시작 이전 구간을 통째로 휴장으로 만든 적이 있다).
    # traded 가 비면(수집 실패) 아무것도 지우지 않는다 — 있는 캘린더를 날리지 않는다.
    if traded:
        # 시드 휴장일은 계산 결과와 합쳐 넘긴다 — 과거 날짜를 손으로 넣었을 때
        # 재동기화가 그걸 지워버리지 않도록.
        _resync_holidays(holidays, start, today)

    n = upsert("market_calendar", rows, on_conflict="event_key")
    by_kind: dict[str, int] = {}
    for r in rows:
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
    log.info("calendar.ingest.done", rows=n, by_kind=by_kind,
             holidays=len(holidays), traded_days=len(traded))
    return by_kind
