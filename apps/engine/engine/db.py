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
    return create_client(s.supabase_url, s.supabase_service_role_key)


def upsert(table: str, rows: list[dict], on_conflict: str | None = None) -> int:
    """행 업서트. 적재 건수 반환."""
    if not rows:
        return 0
    q = get_client().table(table).upsert(rows, on_conflict=on_conflict)
    res = q.execute()
    n = len(res.data or [])
    log.info("upsert", table=table, rows=n)
    return n
