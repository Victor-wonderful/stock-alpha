"""종목 마스터 매핑 — symbol/exchange → instrument_id 해석 및 신규 업서트."""
from __future__ import annotations

from engine.db import select_all, upsert
from engine.logging import get_logger

log = get_logger(__name__)


def load_instrument_map(exchange: str | None = None) -> dict[tuple[str, str], int]:
    """{(symbol, exchange): id} 매핑 로드 (전체 페이지네이션 — 1000행 제한 우회)."""
    rows = select_all(
        "instruments", "id,symbol,exchange",
        eq={"exchange": exchange} if exchange else None,
    )
    return {(r["symbol"], r["exchange"]): r["id"] for r in rows}


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
