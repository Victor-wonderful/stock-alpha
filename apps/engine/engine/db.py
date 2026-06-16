"""Supabase 데이터 스토어 클라이언트 (service_role — RLS 우회 write).

지연 초기화: import 시 자격증명이 없어도 모듈 로드는 성공.
실제 호출 시점에 자격증명을 검증한다.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

from engine.config import get_settings
from engine.logging import get_logger

log = get_logger(__name__)


@lru_cache
def get_client() -> Any:
    """service_role 권한 Supabase 클라이언트."""
    from supabase import create_client  # lazy import

    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise RuntimeError(
            "Supabase 자격증명 없음. NEXT_PUBLIC_SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY 를 .env.local 에 설정하세요."
        )
    client = create_client(s.supabase_url, s.supabase_service_role_key)
    _force_http1(client)
    return client


def _force_http1(client: Any) -> None:
    """PostgREST 세션을 HTTP/1.1 로 교체 — HTTP/2 스트림 상한 회피.

    daily 배치는 한 프로세스에서 수만 건을 요청하는데, supabase-py 기본
    HTTP/2 연결은 단일 커넥션 스트림 상한(~2^? )에서 서버가 GOAWAY 를 보내
    `RemoteProtocolError: ConnectionTerminated` 로 죽는다(2026-06-15 daily 크래시).
    HTTP/1.1 은 그 상한이 없고 keep-alive 풀이 자연스럽게 회전한다.
    내부 구조 의존이라 실패해도 조용히 통과(기본 동작 유지).
    """
    import httpx

    try:
        pg = client.postgrest
        old = pg.session
        pg.session = httpx.Client(
            base_url=old.base_url,
            headers=old.headers,
            timeout=old.timeout,
            http2=False,
            follow_redirects=True,
        )
    except Exception as exc:  # noqa: BLE001 — 내부구조 변동 시 기본 클라이언트 유지
        log.warning("db.force_http1.skip", error=str(exc))


def select_all(
    table: str,
    columns: str = "*",
    *,
    eq: dict[str, Any] | None = None,
    page_size: int = 1000,
) -> list[dict]:
    """PostgREST 기본 1000행 제한을 넘기기 위한 페이지네이션 SELECT.

    eq: 동등 필터 {컬럼: 값}. 모든 행을 모아 반환.
    """
    client = get_client()
    out: list[dict] = []
    start = 0
    while True:
        q = client.table(table).select(columns)
        for col, val in (eq or {}).items():
            q = q.eq(col, val)
        res = q.range(start, start + page_size - 1).execute()
        rows = res.data or []
        out.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size
    return out


def upsert(table: str, rows: list[dict], on_conflict: str | None = None) -> int:
    """행 업서트. 적재 건수 반환."""
    if not rows:
        return 0
    q = get_client().table(table).upsert(rows, on_conflict=on_conflict)
    res = q.execute()
    n = len(res.data or [])
    log.info("upsert", table=table, rows=n)
    return n
