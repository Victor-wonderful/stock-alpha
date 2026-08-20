"""직접 Postgres 벌크 읽기 — PostgREST 종목별 호출(수천 왕복) 대신 단일 스트리밍 쿼리.

배경: 엔진(모스크바 PC) ↔ 호스티드 DB(서울) 간 REST 호출이 종목당 1회(3,859회) →
왕복 지연이 누적돼 배치가 몇 시간. 대량 시계열은 SUPABASE_DB_URL(세션 풀러)로
서버사이드 커서 한 번에 스트리밍하면 왕복 1회로 끝난다.

직접 PG 불가(미설정/실패) 시 호출측이 PostgREST 폴백을 쓰도록 예외를 던진다.
"""
from __future__ import annotations

import pandas as pd

from engine.config import get_settings
from engine.logging import get_logger

log = get_logger(__name__)

_OHLCV_COLS = ["open", "high", "low", "close", "volume"]


def _dsn() -> str:
    dsn = get_settings().supabase_db_url
    if not dsn:
        raise RuntimeError("SUPABASE_DB_URL 미설정 — 직접 PG 벌크 읽기 불가")
    return dsn


def available() -> bool:
    """직접 PG 경로 사용 가능 여부 (DSN 설정됨)."""
    return bool(get_settings().supabase_db_url)


def load_all_ohlcv_1d(bars: int = 500, active_only: bool = True) -> dict[int, pd.DataFrame]:
    """전 종목 최근 `bars` 일봉 → {instrument_id: DataFrame[open..volume, ts(str)]}.

    단일 쿼리(서버사이드 커서 스트리밍). PostgREST 종목별 호출의 벌크 대체.
    반환 형태는 기존 _load_ohlcv 와 동일(시간 오름차순, ts 문자열).
    """
    import psycopg

    join = (
        "join instruments i on i.id = o.instrument_id and i.active = true"
        if active_only else ""
    )
    sql = f"""
        select instrument_id, ts, open, high, low, close, volume
        from (
          select o.instrument_id, o.ts, o.open, o.high, o.low, o.close, o.volume,
                 row_number() over (partition by o.instrument_id order by o.ts desc) rn
          from ohlcv o {join}
          where o.interval = '1d'
        ) t
        where rn <= %s
        order by instrument_id, ts
    """
    buckets: dict[int, list[tuple]] = {}
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor(name="ohlcv_stream") as cur:   # 서버사이드 커서(스트리밍)
            cur.itersize = 50_000
            cur.execute(sql, (bars,))
            for iid, ts, o, h, l, c, v in cur:
                buckets.setdefault(int(iid), []).append((o, h, l, c, v, str(ts)))

    frames: dict[int, pd.DataFrame] = {}
    for iid, rows in buckets.items():
        df = pd.DataFrame(rows, columns=[*_OHLCV_COLS, "ts"])
        df[_OHLCV_COLS] = df[_OHLCV_COLS].astype(float)
        frames[iid] = df
    log.info("db_direct.ohlcv", instruments=len(frames), bars=bars)
    return frames


def load_all_close_1d(bars: int = 160, active_only: bool = True) -> dict[int, list[float]]:
    """전 종목 최근 `bars` 종가만 → {instrument_id: [close...]} (시간 오름차순).

    load_all_ohlcv_1d 의 close 전용·경량판. OHLCV 6컬럼·DataFrame 대신 종가 1컬럼만
    스트리밍해 전송량(모스크바↔서울 WAN)을 줄인다 — 팩터 가격지표는 close 만 필요.
    직접 PG 불가 시 호출측 REST 폴백.
    """
    import psycopg

    join = (
        "join instruments i on i.id = o.instrument_id and i.active = true"
        if active_only else ""
    )
    sql = f"""
        select instrument_id, close
        from (
          select o.instrument_id, o.ts, o.close,
                 row_number() over (partition by o.instrument_id order by o.ts desc) rn
          from ohlcv o {join}
          where o.interval = '1d'
        ) t
        where rn <= %s
        order by instrument_id, ts
    """
    out: dict[int, list[float]] = {}
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor(name="close_stream") as cur:   # 서버사이드 커서(스트리밍)
            cur.itersize = 50_000
            cur.execute(sql, (bars,))
            for iid, c in cur:
                if c is not None:
                    out.setdefault(int(iid), []).append(float(c))
    log.info("db_direct.close", instruments=len(out), bars=bars)
    return out


def load_latest_close_1d(
    active_only: bool = True, as_of: str | None = None
) -> dict[int, float]:
    """전 종목 최신 일봉 종가 → {instrument_id: close}. 단일 윈도우 쿼리.

    fundamental.runner._latest_close 의 종목별 호출(수천 왕복) 벌크 대체.

    as_of: 주면 그 날짜 이하의 최신 종가(과거일 재현). 픽 백필처럼 '그때 알 수
      있었던 것만' 써야 하는 경로에서 필수 — 최신 종가를 쓰면 미래 정보가 섞인다.
    """
    import psycopg

    join = (
        "join instruments i on i.id = o.instrument_id and i.active = true"
        if active_only else ""
    )
    where_asof = "and o.ts::date <= %s" if as_of else ""
    sql = f"""
        select instrument_id, close from (
          select o.instrument_id, o.close,
                 row_number() over (partition by o.instrument_id order by o.ts desc) rn
          from ohlcv o {join}
          where o.interval = '1d' {where_asof}
        ) t where rn = 1
    """
    out: dict[int, float] = {}
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (as_of,) if as_of else ())
            for iid, close in cur:
                if close is not None:
                    out[int(iid)] = float(close)
    log.info("db_direct.latest_close", instruments=len(out), as_of=as_of)
    return out


def latest_bar_date_by_iid(active_only: bool = True) -> dict[int, str]:
    """전 종목 최신 일봉 날짜 → {instrument_id: 'YYYY-MM-DD'}. 단일 윈도우 쿼리.

    신선도 가드용 경량 조회 — OHLCV 전체 대신 종목당 최신 ts 1개만. 인제스트가
    as_of(목표 거래일) 봉을 채웠는지 유니버스 단위로 검증한다(engine.freshness).
    """
    import psycopg

    join = (
        "join instruments i on i.id = o.instrument_id and i.active = true"
        if active_only else ""
    )
    sql = f"""
        select instrument_id, ts from (
          select o.instrument_id, o.ts,
                 row_number() over (partition by o.instrument_id order by o.ts desc) rn
          from ohlcv o {join}
          where o.interval = '1d'
        ) t where rn = 1
    """
    out: dict[int, str] = {}
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            for iid, ts in cur:
                out[int(iid)] = str(ts)[:10]
    log.info("db_direct.latest_bar_date", instruments=len(out))
    return out


def trading_dates_1d(start: str, end: str, min_instruments: int = 50) -> set[str]:
    """구간 내 실제 거래일 → {'YYYY-MM-DD'}. 일봉이 있는 날이 곧 거래일이다.

    거래소는 '쉬는 날' 목록을 주지 않고, pykrx 지수 엔드포인트는 2026 현재 빈 응답을
    낸다(krx.py 의 _safe_krx 주석과 같은 이슈). 대신 우리가 매일 적재하는 ohlcv 를
    쓴다 — 이미 전 종목 일봉이 있으므로 네트워크도 외부 의존도 없다.

    min_instruments: 그날 봉이 있는 종목 수 하한. 인제스트가 몇 종목만 건드린 날을
    거래일로 오인하지 않도록 둔다(한국장은 거래일이면 수천 종목에 봉이 생긴다).
    """
    import psycopg

    sql = """
        select (ts at time zone 'UTC')::date d, count(distinct instrument_id) n
        from ohlcv
        where interval = '1d' and ts >= %s and ts < (%s::date + 1)
        group by 1 having count(distinct instrument_id) >= %s
    """
    out: set[str] = set()
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (start, end, min_instruments))
            for d, _n in cur:
                out.add(str(d)[:10])
    log.info("db_direct.trading_dates", days=len(out), start=start, end=end)
    return out


def flows_by_date(start: str, end: str) -> dict[str, dict[str, float]]:
    """구간의 날짜별 시장 전체 수급 합 → {'YYYY-MM-DD': {'foreign': x, 'institution': y}}.

    flows 는 종목×날짜라 REST 로 읽으면 한 주만 해도 수만 행이다(기존 regime.py 는
    limit 2000 으로 잘라 최근 5일만 겨우 봤다). 주간 브리핑은 «몇 주째 순매도인가»를
    세야 해서 여러 주가 필요하므로 합계를 DB 에서 낸다.
    """
    import psycopg

    sql = """
        select date::text,
               coalesce(sum(foreign_net), 0)     as f,
               coalesce(sum(inst_net), 0)          as i
        from flows
        where date >= %s and date <= %s
        group by date
        order by date
    """
    out: dict[str, dict[str, float]] = {}
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (start, end))
            for d, f, i in cur:
                out[d] = {"foreign": float(f), "institution": float(i)}
    log.info("db_direct.flows_by_date", days=len(out), start=start, end=end)
    return out


def load_latest_financials_fy(active_only: bool = True) -> dict[int, dict]:
    """전 종목 최신 '연간(FY)' 재무 → {instrument_id: row dict}. 단일 윈도우 쿼리.

    fundamental.runner._latest_financials 의 종목별 호출 벌크 대체.
    period LIKE '%FY' 중 period 내림차순 1행(분기 행 혼입 방지 — periods.py 참조).
    """
    import psycopg

    join = (
        "join instruments i on i.id = f.instrument_id and i.active = true"
        if active_only else ""
    )
    sql = f"""
        select * from (
          select f.*,
                 row_number() over (partition by f.instrument_id order by f.period desc) rn
          from financials f {join}
          where f.period like '%%FY'
        ) t where rn = 1
    """
    from decimal import Decimal

    out: dict[int, dict] = {}
    with psycopg.connect(_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            cols = [d.name for d in cur.description]
            for rec in cur:
                # 직접 PG 는 numeric 을 Decimal 로 돌려준다 — PostgREST(JSON float) 와
                # 동일하게 float 로 맞춰 하위 계산(ratios/dcf)의 타입 혼용을 막는다.
                row = {
                    c: (float(v) if isinstance(v, Decimal) else v)
                    for c, v in zip(cols, rec, strict=False)
                }
                row.pop("rn", None)
                out[int(row["instrument_id"])] = row
    log.info("db_direct.latest_financials", instruments=len(out))
    return out
