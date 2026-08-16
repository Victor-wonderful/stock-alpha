"""캘린더 이벤트의 실측 반응 — "그날 실제로 무슨 일이 있었나".

화면에 '선물·옵션 동시만기'라고만 띄우는 건 정보가 아니다. 사용자가 묻는 건 "그래서
나한테 무슨 영향인데?"이고, 그 답은 통념이 아니라 우리 데이터에서 나와야 한다.

무엇을 재는가 — **종목간 산포**(그날 전 종목 일간수익률의 표준편차)를 주 지표로 쓴다.
지수가 제자리여도 종목이 서로 반대로 튀면 커진다. 우리는 지수가 아니라 개별 픽을
들고 있으므로 지수 등락보다 이 값이 실제 위험에 가깝다.

실측 결과(2026-08-16, 442거래일)는 통념과 반대였다 — 만기일은 평소보다 **조용했다**.
그래서 '동시만기 신규진입 차단'은 껐다. 근거 없이 픽만 깎는 규칙이었다.

계산(순수 함수)과 적재를 분리한다. krx.py·calendar.py 와 같은 설계.
"""
from __future__ import annotations

import bisect
import statistics as st
from datetime import date

from engine.db import upsert
from engine.logging import get_logger

log = get_logger(__name__)

SOURCE_VERSION = "cal-impact-v1"

# 표본이 이보다 적으면 적재하지 않는다 — 2~3회짜리 평균을 화면에 '측정값'으로
# 내보내면 없느니만 못하다. 화면은 그때 "측정 이력 없음"이라고 말한다.
MIN_SAMPLE = 5

# 종류별 관측 시점. 밤사이 발표되는 해외 지표는 당일이 아니라 다음 거래일에 반영된다.
OFFSET_BY_KIND: dict[str, int] = {
    "expiry_quad": 0,
    "expiry_opt": 0,
    "index_rebalance": 0,
    "rate_decision": 0,
    "macro_release": 1,     # 미국 발표 → 국내 다음 거래일
}


def _mean(xs: list[float]) -> float | None:
    return st.fmean(xs) if xs else None


def shift_to_trading_day(d: date, trading_days: list[date], offset: int) -> date | None:
    """이벤트일 → 관측 거래일. offset=0 이면 그날(휴장이면 없음), 1이면 다음 거래일.

    trading_days 는 오름차순이어야 한다.
    """
    if offset == 0:
        i = bisect.bisect_left(trading_days, d)
        return trading_days[i] if i < len(trading_days) and trading_days[i] == d else None
    i = bisect.bisect_right(trading_days, d)
    for _ in range(offset - 1):
        i += 1
    return trading_days[i] if i < len(trading_days) else None


def measure(
    daily: dict[date, dict], events: list[dict], kind: str, region: str,
) -> dict | None:
    """한 종류의 반응 측정. (순수 함수)

    daily: {거래일: {dispersion, range, ret}} — 시장 전체 일별 집계.
    events: 그 종류의 이벤트 행들(date 포함).
    표본이 MIN_SAMPLE 미만이면 None — 못 재는 걸 잰 척하지 않는다.
    """
    if not daily:
        return None
    days = sorted(daily)
    offset = OFFSET_BY_KIND.get(kind, 0)

    picked: list[date] = []
    for e in events:
        d = e["date"] if isinstance(e["date"], date) else date.fromisoformat(str(e["date"])[:10])
        obs = shift_to_trading_day(d, days, offset)
        if obs is not None:
            picked.append(obs)
    picked = sorted(set(picked))
    if len(picked) < MIN_SAMPLE:
        log.info("calendar_impact.too_few", kind=kind, n=len(picked))
        return None

    ev = [daily[d] for d in picked]
    allv = list(daily.values())
    return {
        "kind": kind,
        "region": region,
        "offset_days": offset,
        "n": len(picked),
        "dispersion": _mean([x["dispersion"] for x in ev]),
        "base_dispersion": _mean([x["dispersion"] for x in allv]),
        "intraday_range": _mean([x["range"] for x in ev]),
        "base_range": _mean([x["range"] for x in allv]),
        "mean_return": _mean([x["ret"] for x in ev]),
        "base_return": _mean([x["ret"] for x in allv]),
        "window_start": days[0].isoformat(),
        "window_end": days[-1].isoformat(),
        "source_version": SOURCE_VERSION,
    }


def load_daily_stats(since: str = "2024-10-01", min_instruments: int = 500) -> dict[date, dict]:
    """거래일별 시장 집계 — {날짜: {dispersion, range, ret}}.

    단일 쿼리(db_direct). 종목이 min_instruments 미만인 날은 인제스트가 덜 찬 날이라
    제외한다 — 그런 날의 산포는 시장이 아니라 표본을 재는 것이다.
    """
    import psycopg

    from engine.db_direct import _dsn

    sql = """
        with d as (
          select (ts at time zone 'UTC')::date dt, instrument_id, close, high, low,
                 lag(close) over (partition by instrument_id order by ts) prev
          from ohlcv where interval = '1d' and ts >= %s
        )
        select dt,
               stddev_samp(close / prev - 1)          disp,
               avg((high - low) / nullif(prev, 0))    rng,
               avg(close / prev - 1)                  ret
        from d
        where prev is not null and prev > 0
        group by dt having count(*) >= %s
        order by dt
    """
    out: dict[date, dict] = {}
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (since, min_instruments))
            for dt, disp, rng, ret in cur:
                if disp is None:
                    continue
                out[dt] = {"dispersion": float(disp),
                           "range": float(rng or 0), "ret": float(ret or 0)}
    log.info("calendar_impact.daily_stats", days=len(out))
    return out


def run(since: str = "2024-10-01") -> int:
    """전 종류 측정·적재. 적재 건수 반환."""
    from engine.db import select_all

    daily = load_daily_stats(since)
    if not daily:
        log.warning("calendar_impact.no_daily")
        return 0

    events = select_all("market_calendar", "date,kind,region")
    by_key: dict[tuple[str, str], list[dict]] = {}
    for e in events:
        if e["kind"] in ("holiday", "coverage"):
            continue
        by_key.setdefault((e["kind"], e.get("region") or "KR"), []).append(e)

    rows = [r for (kind, region), evs in sorted(by_key.items())
            if (r := measure(daily, evs, kind, region))]
    if not rows:
        log.warning("calendar_impact.nothing_measurable")
        return 0
    n = upsert("calendar_impact", rows, on_conflict="kind,region,offset_days")
    for r in rows:
        log.info("calendar_impact.measured", kind=r["kind"], n=r["n"],
                 disp=round(r["dispersion"], 4), base=round(r["base_dispersion"], 4))
    return n
