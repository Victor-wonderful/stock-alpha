"""시장 이벤트 캘린더 — 예정된 일정만 다룬다.

두 가지 일을 한다.

1. **거래일 판정** — 휴장일을 알아야 "다음 거래일"을 단정할 수 있다. 그전엔 공휴일을
   몰라서 휴장일에 '장전 플랜'을 띄웠고, 임시로 날짜 단정을 회피해 왔다.
2. **발행 억제** — 알려진 변동성 구간(동시만기·지수 리밸런싱 등)에 신규 진입 픽을
   내지 않는다. 기대값을 노리는 규칙이 아니라 회피 규칙이라 게이트와 층이 다르다.

설계는 krx.py 와 같다 — 네트워크(pykrx)와 계산을 분리한다. 이 모듈은 **전부 순수
함수**이고, 적재는 `engine.ingest.calendar_seed` 가 맡는다.

억제 파라미터(block_entry, block_days_before)는 코드가 아니라 **행 데이터**에 있다.
규칙을 바꿀 때 재배포가 아니라 재시드로 끝나고, 어떤 규칙이 언제부터 적용됐는지
테이블만 봐도 안다.
"""
from __future__ import annotations

import calendar as _pycal
from datetime import date, timedelta

# 억제 구간의 상한 — 시드가 이상한 값을 넣어도 픽이 영영 안 나오는 사고를 막는다.
MAX_BLOCK_DAYS = 5

THU = 3  # date.weekday(): 월0 … 목3 … 일6
FRI = 4

# 한국 파생 동시만기(선물+옵션) 월. 나머지 달은 옵션만 만기.
QUAD_MONTHS = frozenset({3, 6, 9, 12})


# ── 거래일 ──────────────────────────────────────────────────────────────

def is_trading_day(d: date, holidays: frozenset[date] | set[date]) -> bool:
    """주말도 휴장일도 아니면 거래일."""
    return d.weekday() < 5 and d not in holidays


def next_trading_day(d: date, holidays: frozenset[date] | set[date],
                     *, include_self: bool = False) -> date:
    """d 이후(include_self=True 면 d 포함) 첫 거래일.

    휴장일 데이터가 없는 미래 구간에서도 최소한 주말은 건너뛴다(graceful).
    """
    cur = d if include_self else d + timedelta(days=1)
    for _ in range(30):  # 최장 연휴도 30일을 넘지 않는다
        if is_trading_day(cur, holidays):
            return cur
        cur += timedelta(days=1)
    return cur


def prev_trading_day(d: date, holidays: frozenset[date] | set[date],
                     *, include_self: bool = False) -> date:
    """d 이전(include_self=True 면 d 포함) 마지막 거래일."""
    cur = d if include_self else d - timedelta(days=1)
    for _ in range(30):
        if is_trading_day(cur, holidays):
            return cur
        cur -= timedelta(days=1)
    return cur


def holidays_from_trading_days(
    traded: set[date] | frozenset[date], start: date, end: date,
    *, min_month_coverage: float = 0.7,
) -> list[date]:
    """실제 거래일 집합 → 휴장일(=거래가 없던 평일) 목록.

    거래소가 "쉬는 날"을 직접 주지는 않으므로, 일봉이 있는 날을 거래일로 보고 그
    여집합(평일 중)을 휴장일로 역산한다. 문제는 **데이터가 없는 것과 장이 쉰 것이
    구분되지 않는다**는 점이라, 두 겹으로 막는다.

    1. 구간을 실제 데이터가 있는 범위로 좁힌다 — 적재 이전 과거를 통째로 휴장으로
       만들지 않는다(실측: ohlcv 가 2024-10 부터인데 2024-01 부터 역산했더니 2.6년에
       휴장 242일이 나왔다. 한국은 연 10~15일이다).
    2. 월 단위 커버리지가 낮으면 그 달은 통째로 판정 보류 — 인제스트가 며칠 빠진 달을
       "연휴"로 읽지 않는다. 명절이 낀 달도 평일의 80% 안팎은 거래일이다.

    traded 가 비면 빈 목록 — 수집 실패 때 온 세상을 휴장으로 만들지 않는다.
    """
    if not traded:
        return []
    lo = max(start, min(traded))
    hi = min(end, max(traded))
    if lo > hi:
        return []

    # 월별 커버리지 — (그 달 거래일 수) / (구간과 겹치는 그 달 평일 수)
    weekdays: dict[tuple[int, int], int] = {}
    traded_n: dict[tuple[int, int], int] = {}
    cur = lo
    while cur <= hi:
        if cur.weekday() < 5:
            k = (cur.year, cur.month)
            weekdays[k] = weekdays.get(k, 0) + 1
            if cur in traded:
                traded_n[k] = traded_n.get(k, 0) + 1
        cur += timedelta(days=1)
    trusted = {
        k for k, n in weekdays.items()
        if n > 0 and traded_n.get(k, 0) / n >= min_month_coverage
    }

    out: list[date] = []
    cur = lo
    while cur <= hi:
        if (cur.weekday() < 5 and cur not in traded
                and (cur.year, cur.month) in trusted):
            out.append(cur)
        cur += timedelta(days=1)
    return out


# ── 날짜 계산 ───────────────────────────────────────────────────────────

def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """그 달의 n번째 특정 요일. (예: 2번째 목요일 → nth_weekday(y, m, 3, 2))"""
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def month_end_trading_day(year: int, month: int,
                          holidays: frozenset[date] | set[date]) -> date:
    """그 달 마지막 거래일."""
    last = date(year, month, _pycal.monthrange(year, month)[1])
    return prev_trading_day(last, holidays, include_self=True)


# ── 계산으로 확정되는 이벤트 ────────────────────────────────────────────

def expiry_events(year: int, holidays: frozenset[date] | set[date]) -> list[dict]:
    """파생 만기일 — 매월 두 번째 목요일. 휴장이면 직전 거래일로 당겨진다.

    3·6·9·12월은 선물·옵션 동시만기('네 마녀'), 나머지 달은 옵션만 만기.

    ⚠️ **차단하지 않는다.** 처음엔 동시만기 당일 신규 진입을 막았다("수급 왜곡이 큰
    날은 피한다"). 그런데 우리 일봉 442일로 재보니 통념이 틀렸다(2026-08-16):

        전체 평균    종목간 산포 4.10% · 일중 변동폭 3.95% · 평균등락 +0.09%
        동시만기(7)  종목간 산포 3.05% · 일중 변동폭 3.73% · 평균등락 +0.48%
        옵션만기(22) 종목간 산포 3.15% · 일중 변동폭 3.81% · 평균등락 +0.42%

    만기일은 오히려 **평소보다 조용했고 수익률도 좋았다**. 근거 없이 픽만 깎는 규칙이라
    껐다(pead 기대값 -0.02 로 탈락시킨 것과 같은 판단). 표본이 쌓여 반대 결과가 나오면
    block_entry 만 다시 켜면 된다 — 억제 로직 자체는 그대로 살아 있다.
    측정은 engine.market.calendar_impact, 근거는 calendar_impact 테이블.
    """
    out: list[dict] = []
    for month in range(1, 13):
        d = prev_trading_day(nth_weekday(year, month, THU, 2), holidays,
                             include_self=True)
        quad = month in QUAD_MONTHS
        out.append({
            "date": d,
            "event_key": f"expiry-{'quad' if quad else 'opt'}-{d:%Y-%m}",
            # 동시만기와 옵션만기를 한 종류로 묶으면 실측이 뭉개진다(동시 7회가 옵션
            # 22회에 희석). 성격이 다른 날이므로 종류를 나눠 각각 측정한다.
            "kind": "expiry_quad" if quad else "expiry_opt",
            "title": "선물·옵션 동시만기" if quad else "옵션 만기",
            "region": "KR",
            "severity": 2 if quad else 1,
            "block_entry": False,
            "block_days_before": 0,
            "source": "computed",
        })
    return out


def index_rebalance_events(year: int,
                           holidays: frozenset[date] | set[date]) -> list[dict]:
    """KOSPI200 정기변경 — 6·12월 동시만기일의 다음 거래일에 발효.

    편입/제외 종목에 지수 추종 자금이 한꺼번에 들어오고 나간다. 종목 단위 영향이라
    시장 전체를 막지는 않되(block_entry=false) 픽 카드에는 경고로 띄운다.
    """
    out: list[dict] = []
    for month in (6, 12):
        expiry = prev_trading_day(nth_weekday(year, month, THU, 2), holidays,
                                  include_self=True)
        d = next_trading_day(expiry, holidays)
        out.append({
            "date": d,
            "event_key": f"kospi200-rebalance-{d:%Y-%m}",
            "kind": "index_rebalance",
            "title": "KOSPI200 정기변경 발효",
            "region": "KR",
            "severity": 2,
            "block_entry": False,
            "block_days_before": 0,
            "source": "computed",
        })
    return out


def nfp_events(year: int) -> list[dict]:
    """미국 비농업고용(NFP) — 매월 첫 금요일 발표(현지). 국내 반영은 다음 거래일.

    발표 자체는 밤이라 국내 당일 종가에는 안 걸린다. 기록만 하고 차단하지 않는다 —
    차단할지는 이벤트 스터디로 실제 반응을 재본 뒤에 정한다.
    """
    out: list[dict] = []
    for month in range(1, 13):
        d = nth_weekday(year, month, FRI, 1)
        out.append({
            "date": d,
            "event_key": f"us-nfp-{d:%Y-%m}",
            "kind": "macro_release",
            "title": "미국 비농업고용(NFP)",
            "region": "US",
            "severity": 2,
            "block_entry": False,
            "block_days_before": 0,
            "source": "computed",
        })
    return out


def computed_events(year: int,
                    holidays: frozenset[date] | set[date]) -> list[dict]:
    """규칙으로 확정되는 이벤트 전부.

    확정 규칙이 있는 것만 여기 둔다. FOMC·금통위·CPI 처럼 **매년 기관이 정하는 날짜**는
    추측하면 안 되므로 시드 파일(data/calendar_events.yml)에서 읽는다.
    """
    return expiry_events(year, holidays) + index_rebalance_events(year, holidays) \
        + nfp_events(year)


def holiday_rows(holidays: list[date] | set[date]) -> list[dict]:
    """휴장일 → 캘린더 행. 휴장일 자체는 거래가 없으니 차단 대상이 아니다."""
    return [{
        "date": d,
        "event_key": f"kr-holiday-{d:%Y-%m-%d}",
        "kind": "holiday",
        "title": "휴장",
        "region": "KR",
        "severity": 1,
        "block_entry": False,
        "block_days_before": 0,
        "source": "pykrx",
    } for d in sorted(holidays)]


# ── 소비 측 ─────────────────────────────────────────────────────────────

def blocking_events(as_of: date, events: list[dict]) -> list[dict]:
    """as_of 에 신규 진입을 막는 이벤트들.

    events 행의 block_entry / block_days_before 를 그대로 해석한다.
    D-block_days_before ~ D0 구간이면 차단. block_days_before 는 MAX_BLOCK_DAYS 로
    자른다 — 시드 실수로 픽이 영영 0건이 되는 걸 막는 안전핀.
    """
    out: list[dict] = []
    for e in events:
        if not e.get("block_entry"):
            continue
        d = _as_date(e.get("date"))
        if d is None:
            continue
        lead = min(int(e.get("block_days_before") or 0), MAX_BLOCK_DAYS)
        if 0 <= (d - as_of).days <= lead:
            out.append(e)
    return out


def upcoming(as_of: date, events: list[dict], *, days: int = 7,
             instrument_id: int | None = None) -> list[dict]:
    """as_of 부터 days 일 안의 이벤트 — 날짜순.

    instrument_id 를 주면 시장 전체 이벤트 + 그 종목 이벤트만. 휴장은 일정이 아니라
    달력이라 제외한다.
    """
    out: list[dict] = []
    for e in events:
        if e.get("kind") == "holiday":
            continue
        iid = e.get("instrument_id")
        if iid is not None and iid != instrument_id:
            continue
        d = _as_date(e.get("date"))
        if d is None:
            continue
        delta = (d - as_of).days
        if 0 <= delta <= days:
            out.append({**e, "date": d, "d_day": delta})
    return sorted(out, key=lambda e: (e["date"], -int(e.get("severity") or 0)))


def _as_date(v) -> date | None:
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        try:
            return date.fromisoformat(v[:10])
        except ValueError:
            return None
    return None
