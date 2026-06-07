"""인제스트 실행 — 소스별 fetch → normalize → DB 업서트 오케스트레이션."""
from __future__ import annotations

from datetime import date, timedelta

from engine.db import upsert
from engine.ingest import dart, krx
from engine.ingest.instruments import load_instrument_map
from engine.logging import get_logger

log = get_logger(__name__)


def _yyyymmdd(d: date) -> str:
    return d.strftime("%Y%m%d")


def ingest_krx_prices(days: int = 30) -> int:
    """KRX 전 종목(마스터에 등록된) 일봉 OHLCV 적재."""
    imap = load_instrument_map("KRX")
    todate = date.today()
    fromdate = todate - timedelta(days=days)
    total = 0
    for (symbol, _exchange), iid in imap.items():
        try:
            df = krx.fetch_ohlcv(symbol, _yyyymmdd(fromdate), _yyyymmdd(todate))
            rows = krx.normalize_ohlcv(df, iid)
            total += upsert("ohlcv", rows, on_conflict="instrument_id,ts,interval")
        except Exception as e:  # noqa: BLE001 — 종목 단위 실패는 건너뛰고 계속
            log.warning("ohlcv.fail", symbol=symbol, error=str(e))
    log.info("ingest_krx_prices.done", rows=total)
    return total


def ingest_krx_flows(days: int = 30) -> int:
    """KRX 투자자별 순매수 + 공매도 적재."""
    imap = load_instrument_map("KRX")
    todate = date.today()
    fromdate = todate - timedelta(days=days)
    total = 0
    for (symbol, _exchange), iid in imap.items():
        try:
            fdf = krx.fetch_flows(symbol, _yyyymmdd(fromdate), _yyyymmdd(todate))
            flows = krx.normalize_flows(fdf, iid)
            svol, sbal = krx.fetch_short(symbol, _yyyymmdd(fromdate), _yyyymmdd(todate))
            merged = krx.merge_short_into_flows(flows, svol, sbal)
            total += upsert("flows", merged, on_conflict="instrument_id,date")
        except Exception as e:  # noqa: BLE001
            log.warning("flows.fail", symbol=symbol, error=str(e))
    log.info("ingest_krx_flows.done", rows=total)
    return total


def ingest_krx_financials(year: str, reprt_code: str = "11011") -> int:
    """KRX 종목 연결재무제표 적재. CFS 없으면 OFS(별도) 폴백."""
    imap = load_instrument_map("KRX")
    corp_map = dart.fetch_corp_code_map()
    total = 0
    for (symbol, _exchange), iid in imap.items():
        corp = corp_map.get(symbol)
        if not corp:
            continue
        try:
            rows: list[dict] = []
            for fs_div in ("CFS", "OFS"):
                api = dart.fetch_financials(corp, year, reprt_code, fs_div)
                rows = dart.normalize_financials(api, iid, year, reprt_code, fs_div)
                if rows:
                    break
            total += upsert("financials", rows, on_conflict="instrument_id,period,fs_type")
        except Exception as e:  # noqa: BLE001
            log.warning("financials.fail", symbol=symbol, error=str(e))
    log.info("ingest_krx_financials.done", rows=total)
    return total
