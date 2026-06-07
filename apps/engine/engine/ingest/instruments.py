"""종목 마스터 매핑 — symbol/exchange → instrument_id 해석 및 신규 업서트."""
from __future__ import annotations

from engine.db import get_client, upsert
from engine.logging import get_logger

log = get_logger(__name__)


def load_instrument_map(exchange: str | None = None) -> dict[tuple[str, str], int]:
    """{(symbol, exchange): id} 매핑 로드."""
    q = get_client().table("instruments").select("id,symbol,exchange")
    if exchange:
        q = q.eq("exchange", exchange)
    res = q.execute()
    return {(r["symbol"], r["exchange"]): r["id"] for r in (res.data or [])}


def ensure_instruments(rows: list[dict]) -> dict[tuple[str, str], int]:
    """주어진 종목들을 업서트하고 최신 매핑을 반환.

    rows: [{symbol, exchange, name, sector?, asset_type?, currency?}, ...]
    """
    if rows:
        upsert("instruments", rows, on_conflict="symbol,exchange")
    exchanges = {r["exchange"] for r in rows} if rows else set()
    if len(exchanges) == 1:
        return load_instrument_map(next(iter(exchanges)))
    return load_instrument_map()
