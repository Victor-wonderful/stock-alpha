"""이벤트 성적표 — "이 뉴스 뒤에 실제로 어떻게 됐나"를 세어 남긴다.

우리 서비스는 뉴스를 보여주기만 했다. 판단은 사용자 몫이었고, 대부분은 "좋은 소식
같으니 사야지" 한다. 이 모듈은 그 자리에 놓을 근거를 만든다.

재는 방식
  · 초과수익 = 그 종목 등락 − 그날 시장 평균 등락. 시장이 통째로 오른 날 같이 오른
    건 그 뉴스의 공로가 아니다.
  · 진입 시점은 **공시 다음 거래일**. 접수 시각을 모르므로(장중일 수도 장 마감 후일
    수도 있다) 당일 종가에 샀다고 치면 실제로는 못 산 가격으로 성적을 부풀리게 된다.
  · 창은 1일·5일·20일. 20일은 대략 한 달.

계산에서 빼는 것 — 감자·액면병합처럼 **주가 기준이 바뀐 구간**. 10주를 1주로 합치면
주가가 10배가 되는데 그건 오른 게 아니다. 한국 주식은 하루 ±30% 를 못 넘으므로 그걸
넘는 등락이 낀 창은 통째로 버린다(engine.ingest.price_repair 와 같은 규칙).

표본이 적으면 판정하지 않는다. 2~3건짜리 평균을 "이 뉴스는 좋습니다"로 내보내는 건
근거가 아니라 소음이다.
"""
from __future__ import annotations

import statistics as st
from datetime import date

from engine.ingest.price_repair import LIMIT as MOVE_LIMIT
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "event-study-v1"

WINDOWS = (1, 5, 20)

# 판정 문턱 — 2개월치 표본에서 과신하지 않기 위한 보수적 기준.
MIN_SAMPLE = 50          # 이보다 적으면 insufficient(아직 판단 못 함)
GOOD_WIN = 0.55          # 시장 대비라 50% 가 중립. 55% 부터 '좋음'
CAUTION_WIN = 0.45


def car_for_event(
    rets: dict[str, float], market: dict[str, float], days: list[str],
    event_date: str, k: int,
) -> float | None:
    """한 이벤트의 k거래일 누적 초과수익. 창을 못 채우거나 기준 변경이 끼면 None.

    days 는 시장 거래일 오름차순. 진입은 event_date **다음** 거래일부터.
    """
    import bisect

    i = bisect.bisect_right(days, event_date)
    if i + k > len(days):
        return None
    total = 0.0
    for d in days[i:i + k]:
        r = rets.get(d)
        if r is None:
            return None
        if abs(r) > MOVE_LIMIT:      # 감자·병합 등 기준 변경 — 비교 불가
            return None
        m = market.get(d)
        if m is None:
            return None
        total += r - m
    return total


def summarize(
    per_event: dict[int, list[float | None]], source: str, event_type: str,
    *, cost: float = 0.0, window_start: str | None = None,
    window_end: str | None = None,
) -> dict:
    """이벤트별 창 결과 → 유형 성적표 한 행. (순수 함수)

    per_event: {일련번호: [car_1d, car_5d, car_20d]} — None 은 관측 불가.
    cost: 왕복 거래비용(비율). 20일 순수익 계산에만 쓴다.
    """
    cols: list[list[float]] = [[], [], []]
    excluded = 0
    for vals in per_event.values():
        if any(v is None for v in vals):
            excluded += 1
        for idx, v in enumerate(vals):
            if v is not None:
                cols[idx].append(v)

    n = len(cols[2])            # 20일 창을 채운 표본이 기준
    wins = [v for v in cols[2] if v > 0]
    win = len(wins) / n if n else None
    car20 = st.fmean(cols[2]) if cols[2] else None

    return {
        "source": source,
        "event_type": event_type,
        "n": n,
        "car_1d": st.fmean(cols[0]) if cols[0] else None,
        "car_5d": st.fmean(cols[1]) if cols[1] else None,
        "car_20d": car20,
        "car_20d_net": (car20 - cost) if car20 is not None else None,
        "win_20d": round(win, 4) if win is not None else None,
        "median_20d": st.median(cols[2]) if cols[2] else None,
        "n_excluded": excluded,
        "verdict": verdict_for(n, car20, win),
        "window_start": window_start,
        "window_end": window_end,
        "source_version": SOURCE_VERSION,
    }


def verdict_for(n: int, car20: float | None, win: float | None) -> str:
    """성적표 판정. 표본이 얕으면 판정하지 않는다.

    '아직 판단 못 함'을 말할 줄 아는 게 이 표의 신뢰를 지킨다 — 2~3건짜리 평균에
    '좋음'을 붙이는 순간 나머지 판정도 같이 못 믿게 된다.
    """
    if n < MIN_SAMPLE or car20 is None or win is None:
        return "insufficient"
    if car20 > 0 and win >= GOOD_WIN:
        return "good"
    if car20 < 0 and win <= CAUTION_WIN:
        return "caution"
    return "neutral"


# ── 적재 ────────────────────────────────────────────────────────────────

def _load_prices(since: str) -> tuple[dict[int, dict[str, float]], dict[str, float], list[str]]:
    """(종목별 일간등락, 시장 평균등락, 거래일 목록). 단일 쿼리 2회."""
    import psycopg

    from engine.db_direct import _dsn

    sql = """
        with d as (
          select instrument_id, (ts at time zone 'UTC')::date dt, close,
                 lag(close) over (partition by instrument_id order by ts) prev
          from ohlcv where interval = '1d' and ts >= %s
        )
        select instrument_id, dt, close / prev - 1 from d where prev > 0
    """
    mkt_sql = """
        with d as (
          select instrument_id, (ts at time zone 'UTC')::date dt, close,
                 lag(close) over (partition by instrument_id order by ts) prev
          from ohlcv where interval = '1d' and ts >= %s
        )
        select dt, avg(close / prev - 1) from d
        where prev > 0 and abs(close / prev - 1) <= %s
        group by dt having count(*) > 500 order by dt
    """
    rets: dict[int, dict[str, float]] = {}
    market: dict[str, float] = {}
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (since,))
            for iid, dt, r in cur:
                rets.setdefault(int(iid), {})[str(dt)] = float(r)
            # 시장 평균에도 기준 변경 종목이 섞이면 비교 기준 자체가 오염된다.
            cur.execute(mkt_sql, (since, MOVE_LIMIT))
            for dt, r in cur:
                market[str(dt)] = float(r)
    return rets, market, sorted(market)


def run(since: str = "2026-01-01") -> int:
    """공시 유형별 성적표 계산·적재. 적재 행 수 반환."""
    from engine.backtest.costs import default_cost_model
    from engine.db import select_all, upsert

    rets, market, days = _load_prices(since)
    if not days:
        log.warning("event_study.no_prices")
        return 0

    cm = default_cost_model()
    # 왕복 비용을 비율로 — 진입가 100 기준 왕복 손실분.
    cost = cm.round_trip_cost(100.0, 100.0) / 100.0

    discl = select_all("disclosures", "instrument_id,event_type,rcept_dt")
    by_type: dict[str, list[tuple[int, str]]] = {}
    for d in discl:
        if d.get("instrument_id") and d.get("event_type") and d.get("rcept_dt"):
            by_type.setdefault(d["event_type"], []).append(
                (int(d["instrument_id"]), str(d["rcept_dt"])[:10])
            )

    rows = []
    for etype, items in sorted(by_type.items()):
        per_event: dict[int, list[float | None]] = {}
        for idx, (iid, ds) in enumerate(items):
            r = rets.get(iid, {})
            per_event[idx] = [car_for_event(r, market, days, ds, k) for k in WINDOWS]
        rows.append(summarize(per_event, "disclosure", etype, cost=cost,
                              window_start=days[0], window_end=days[-1]))

    n = upsert("event_evidence", rows, on_conflict="source,event_type")
    for r in sorted(rows, key=lambda x: -(x["n"] or 0))[:6]:
        log.info("event_study.measured", type=r["event_type"], n=r["n"],
                 car20=r["car_20d"], win=r["win_20d"], verdict=r["verdict"])
    log.info("event_study.done", rows=n, types=len(rows))
    return n


def latest_evidence(source: str = "disclosure") -> dict[str, dict]:
    """{event_type: 성적표 행} — 소비처(리포트·웹 BFF)용 읽기 도우미."""
    from engine.db import select_all

    return {
        r["event_type"]: r
        for r in select_all("event_evidence", "*", eq={"source": source})
    }
