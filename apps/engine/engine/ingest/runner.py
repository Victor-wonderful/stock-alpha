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
    """KRX 투자자별 순매수 + 공매도 적재.

    주의: 2026 현재 KRX 백엔드 변경으로 pykrx 의 투자자 수급·공매도 엔드포인트가
    빈 응답을 반환한다(OHLCV 만 정상). 데이터를 못 받으면 0행으로 끝나며, 전 종목
    빈 응답이면 업스트림 차단으로 간주해 한 줄 경고를 남긴다.
    """
    imap = load_instrument_map("KRX")
    todate = date.today()
    fromdate = todate - timedelta(days=days)
    total = 0
    empty_symbols = 0
    for (symbol, _exchange), iid in imap.items():
        try:
            fdf = krx.fetch_flows(symbol, _yyyymmdd(fromdate), _yyyymmdd(todate))
            flows = krx.normalize_flows(fdf, iid)
            svol, sbal = krx.fetch_short(symbol, _yyyymmdd(fromdate), _yyyymmdd(todate))
            merged = krx.merge_short_into_flows(flows, svol, sbal)
            if not merged:
                empty_symbols += 1
                continue
            total += upsert("flows", merged, on_conflict="instrument_id,date")
        except Exception as e:  # noqa: BLE001
            log.warning("flows.fail", symbol=symbol, error=str(e))
    if total == 0 and empty_symbols:
        log.warning(
            "flows.upstream_unavailable",
            symbols=empty_symbols,
            detail="KRX 투자자수급·공매도 pykrx 엔드포인트 빈 응답(업스트림). "
            "OHLCV 는 정상. 대체 소스(KRX OpenAPI 등) 필요.",
        )
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
            # 상장주식수 보강 — PER/PBR/EV·EBITDA/DCF 산출에 필요(재무제표엔 없음).
            if rows:
                try:
                    shares = dart.fetch_shares(corp, year, reprt_code)
                    if shares:
                        rows[0]["shares"] = shares
                except Exception as e:  # noqa: BLE001 — 주식수 실패는 비치명
                    log.warning("shares.fail", symbol=symbol, error=str(e))
            total += upsert("financials", rows, on_conflict="instrument_id,period,fs_type")
        except Exception as e:  # noqa: BLE001
            log.warning("financials.fail", symbol=symbol, error=str(e))
    log.info("ingest_krx_financials.done", rows=total)
    return total
