"""인제스트 실행 — 소스별 fetch → normalize → DB 업서트 오케스트레이션."""
from __future__ import annotations

from datetime import date, timedelta

from engine.db import upsert
from engine.ingest import dart, krx, naver
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


def ingest_krx_flows(days: int = 30, pages: int = 3) -> int:
    """투자자별 순매수(외국인·기관) 적재 — 네이버 금융 소스.

    pykrx 의 KRX 투자자수급·공매도 엔드포인트가 업스트림 breakage(빈 응답)라
    네이버 금융(item/frgn.naver)에서 외국인·기관 순매매를 받아 적재한다.
    공매도(short_*)·개인·프로그램은 이 소스에 없어 미적재(다른 소스 필요).
    `days` 는 호환 위해 받지만 네이버는 page 단위 → pages(페이지당 ~20거래일) 사용.
    """
    imap = load_instrument_map("KRX")
    total = 0
    empty_symbols = 0
    for (symbol, _exchange), iid in imap.items():
        try:
            df = naver.fetch_frgn(symbol, pages=pages)
            rows = naver.normalize_flows(df, iid)
            if not rows:
                empty_symbols += 1
                continue
            total += upsert("flows", rows, on_conflict="instrument_id,date")
        except Exception as e:  # noqa: BLE001
            log.warning("flows.fail", symbol=symbol, error=str(e))
    if total == 0 and empty_symbols:
        log.warning(
            "flows.empty",
            symbols=empty_symbols,
            detail="네이버 수급 파싱 0행 — 페이지 구조 변경 가능성 점검 필요.",
        )
    log.info("ingest_krx_flows.done", rows=total, source="naver")
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
