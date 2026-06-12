"""종목 마스터 매핑 — symbol/exchange → instrument_id 해석 및 신규 업서트."""
from __future__ import annotations

from engine.db import select_all, upsert
from engine.logging import get_logger

log = get_logger(__name__)

# 한국 시장 거래소 값 — 시딩은 KOSPI/KOSDAQ 로 구분 저장(2026-06-10),
# 'KRX' 는 구분 백필 전 레거시 값(점진 소멸).
KR_EXCHANGES = ("KOSPI", "KOSDAQ", "KRX")


def load_instrument_map(exchange: str | None = None) -> dict[tuple[str, str], int]:
    """{(symbol, exchange): id} 매핑 로드 (전체 페이지네이션 — 1000행 제한 우회)."""
    rows = select_all(
        "instruments", "id,symbol,exchange",
        eq={"exchange": exchange} if exchange else None,
    )
    return {(r["symbol"], r["exchange"]): r["id"] for r in rows}


def load_kr_instrument_map(active_only: bool = True) -> dict[tuple[str, str], int]:
    """한국 시장(KOSPI/KOSDAQ/레거시 KRX) 매핑.

    기본은 활성 실주식만 — ETF/ETN/스팩(비활성 ~1,300종목)에 인제스트 호출을
    낭비하지 않는다(2026-06-12 점검: 수급 배치가 3,859 전체를 돌고 있었음).
    전체가 필요하면 active_only=False.
    """
    rows = select_all("instruments", "id,symbol,exchange,active")
    return {
        (r["symbol"], r["exchange"]): r["id"]
        for r in rows
        if r["exchange"] in KR_EXCHANGES and (not active_only or r.get("active"))
    }


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
