"""FRED 매크로 인제스트 — 미국 시장/금리/환율/유가 (모닝 브리프 입력).

밤사이 바뀌는 건 국내 가격이 아니라 해외 변수 → 08:30 모닝 배치에서 갱신.
키 없으면 조용히 0건(브리프는 매크로 없이도 발행).
"""
from __future__ import annotations

from engine.config import get_settings
from engine.db import upsert
from engine.logging import get_logger

log = get_logger(__name__)

_BASE = "https://api.stlouisfed.org/fred/series/observations"

# series_id → 라벨 (모닝 브리프 서술용)
SERIES: dict[str, str] = {
    "VIXCLS": "VIX 변동성지수",
    "DGS10": "미 10년물 금리(%)",
    "DEXKOUS": "원/달러 환율",
    "DCOILWTICO": "WTI 유가($)",
    "SP500": "S&P 500",
    "NASDAQCOM": "나스닥 종합",
}


def normalize_observations(series_id: str, observations: list[dict]) -> list[dict]:
    """FRED observations → macro 행. 결측('.') 제외. (순수 함수)"""
    rows = []
    for o in observations:
        v = o.get("value")
        if v in (None, "", "."):
            continue
        rows.append({
            "series_id": series_id,
            "date": o["date"],
            "value": float(v),
            "source": "FRED",
        })
    return rows


def fetch_series(series_id: str, api_key: str, days: int = 30) -> list[dict]:
    import httpx

    r = httpx.get(_BASE, params={
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": days,
    }, timeout=20)
    r.raise_for_status()
    return r.json().get("observations", [])


def ingest_macro(days: int = 30) -> int:
    """FRED 시리즈 일괄 적재. 키 없으면 0건."""
    key = get_settings().fred_api_key
    if not key:
        log.warning("macro.no_fred_key")
        return 0
    total = 0
    for sid in SERIES:
        try:
            rows = normalize_observations(sid, fetch_series(sid, key, days))
            total += upsert("macro", rows, on_conflict="series_id,date")
        except Exception as e:  # noqa: BLE001 — 시리즈 단위 실패는 건너뜀
            log.warning("macro.fail", series=sid, error=str(e))
    log.info("ingest_macro.done", rows=total)
    return total
