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
