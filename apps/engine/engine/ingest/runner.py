"""인제스트 실행 — 소스별 fetch → normalize → DB 업서트 오케스트레이션."""
from __future__ import annotations

from datetime import date, timedelta

from engine.db import select_all, upsert
from engine.ingest import dart, krx, naver
from engine.ingest.instruments import KR_EXCHANGES, load_kr_instrument_map
from engine.logging import get_logger

log = get_logger(__name__)


def _yyyymmdd(d: date) -> str:
    return d.strftime("%Y%m%d")


def ingest_krx_prices(days: int = 30, workers: int = 12) -> int:
    """KRX 전 종목(마스터에 등록된) 일봉 OHLCV 적재.

    pykrx 횡단면(by_ticker) 엔드포인트가 죽어 per-ticker 호출만 가능 → fetch 가
    병목이라 스레드풀로 병렬화(workers). upsert 는 메인스레드에서 순차(Supabase
    동시쓰기 회피). 종목 단위 실패는 건너뛰고 계속.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    imap = load_kr_instrument_map()
    todate = date.today()
    fromdate = todate - timedelta(days=days)
    f, t = _yyyymmdd(fromdate), _yyyymmdd(todate)

    def _fetch(item: tuple) -> tuple:
        (symbol, _exch), iid = item
        try:
            df = krx.fetch_ohlcv(symbol, f, t)
            return iid, symbol, krx.normalize_ohlcv(df, iid), None
        except Exception as e:  # noqa: BLE001
            return iid, symbol, [], str(e)

    items = list(imap.items())
    total = 0
    done = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(_fetch, it) for it in items]
        for fut in as_completed(futures):
            _iid, symbol, rows, err = fut.result()
            if err:
                failed += 1
                log.warning("ohlcv.fail", symbol=symbol, error=err)
            elif rows:
                total += upsert("ohlcv", rows, on_conflict="instrument_id,ts,interval")
            done += 1
            if done % 250 == 0:
                log.info("ohlcv.progress", done=done, of=len(items), rows=total, failed=failed)
    log.info("ingest_krx_prices.done", rows=total, symbols=len(items), failed=failed)
    return total


def ingest_krx_flows(days: int = 30, pages: int = 3, workers: int = 8, resume: bool = True) -> int:
    """투자자별 순매수(외국인·기관) 적재 — 네이버 금융 소스.

    pykrx 의 KRX 투자자수급·공매도 엔드포인트가 업스트림 breakage(빈 응답)라
    네이버 금융(item/frgn.naver)에서 외국인·기관 순매매를 받아 적재한다.
    공매도(short_*)·개인·프로그램은 이 소스에 없어 미적재(다른 소스 필요).
    `days` 는 호환 위해 받지만 네이버는 page 단위 → pages(페이지당 ~20거래일) 사용.

    활성 주식만 대상(펀드/파생 제외). fetch_frgn(페이지 순차)이 병목 → 스레드풀
    병렬(workers, 네이버 차단 회피 위해 보수적). resume=True 면 이미 flows 있는
    종목 건너뜀(재시작 효율).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    inst = [
        r for r in select_all("instruments", "id,symbol,exchange", eq={"active": True})
        if r["exchange"] in KR_EXCHANGES
    ]
    have = (
        {r["instrument_id"] for r in select_all("flows", "instrument_id")}
        if resume else set()
    )
    targets = [(it["symbol"], it["id"]) for it in inst if it["id"] not in have]

    def _fetch(t: tuple) -> tuple:
        symbol, iid = t
        try:
            df = naver.fetch_frgn(symbol, pages=pages)
            return symbol, naver.normalize_flows(df, iid), None
        except Exception as e:  # noqa: BLE001
            return symbol, [], str(e)

    total = 0
    done = 0
    empty = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(_fetch, t) for t in targets]
        for fut in as_completed(futures):
            symbol, rows, err = fut.result()
            if err:
                failed += 1
                log.warning("flows.fail", symbol=symbol, error=err)
            elif rows:
                total += upsert("flows", rows, on_conflict="instrument_id,date")
            else:
                empty += 1
            done += 1
            if done % 200 == 0:
                log.info("flows.progress", done=done, of=len(targets), rows=total, failed=failed)
    log.info("ingest_krx_flows.done", rows=total, targets=len(targets), empty=empty, failed=failed, source="naver")
    return total


def ingest_krx_financials(
    year: str, reprt_code: str = "11011", workers: int = 6, refresh: bool = False,
) -> int:
    """KRX 종목 연결재무제표 + 상장주식수 적재. CFS 없으면 OFS(별도) 폴백.

    DART 호출(종목당 최대 3회: CFS/OFS 재무 + 주식수)이 병목 → 스레드풀 병렬화.
    DART 분당 throttle 을 고려해 워커는 보수적(기본 6). corp_code 없는 종목
    (ETF/ETN/스팩 등 비공시자)은 건너뜀. upsert 는 메인스레드 순차.

    분기보고서(11013/11012/11014)도 동일 경로 — period 는 normalize 와 같은
    형식(2025Q1 등)을 써야 재개(resume) 키가 맞는다. 주식수는 연간(11011)만
    조회(분기 호출 절약 — DART 일일 한도 2만 건 가드).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    imap = load_kr_instrument_map()
    corp_map = dart.fetch_corp_code_map()
    is_annual = reprt_code == "11011"
    period = f"{year}{dart._REPRT_TO_PERIOD.get(reprt_code, reprt_code)}"
    # 재개 가능: 이미 해당 기간 재무가 있는 종목은 건너뜀(재시작 시 중복 호출 방지).
    # refresh=True 면 전부 재인제스트 — disclosed_at 백필 등 컬럼 보강용.
    have = (
        set() if refresh else {
            r["instrument_id"]
            for r in select_all("financials", "instrument_id,period", eq={"period": period})
        }
    )
    targets = [
        (symbol, iid, corp_map[symbol])
        for (symbol, _exch), iid in imap.items()
        if corp_map.get(symbol) and iid not in have
    ]

    def _fetch(t: tuple) -> tuple:
        symbol, iid, corp = t
        try:
            rows: list[dict] = []
            for fs_div in ("CFS", "OFS"):
                api = dart.fetch_financials(corp, year, reprt_code, fs_div)
                rows = dart.normalize_financials(api, iid, year, reprt_code, fs_div)
                if rows:
                    break
            if rows and is_annual:
                shares = dart.fetch_shares(corp, year, reprt_code)
                if shares:
                    rows[0]["shares"] = shares
            return symbol, rows, None
        except dart.DartQuotaError as e:
            return symbol, [], e  # 한도 도달 — 메인 루프가 전체 중단
        except Exception as e:  # noqa: BLE001
            return symbol, [], str(e)

    total = 0
    done = 0
    failed = 0
    quota_hit = False
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(_fetch, t) for t in targets]
        for fut in as_completed(futures):
            if fut.cancelled():
                continue
            symbol, rows, err = fut.result()
            if isinstance(err, dart.DartQuotaError):
                # 한도 도달 — 미시작 작업 취소 후 종료. 재개는 resume 키(have)가 보장.
                if not quota_hit:
                    quota_hit = True
                    log.warning("financials.quota_exceeded", used=dart.quota_used(), done=done)
                    for f in futures:
                        f.cancel()
                continue
            if err:
                failed += 1
                log.warning("financials.fail", symbol=symbol, error=err)
            elif rows:
                total += upsert("financials", rows, on_conflict="instrument_id,period,fs_type")
            done += 1
            if done % 200 == 0:
                log.info(
                    "financials.progress", done=done, of=len(targets), rows=total,
                    failed=failed, dart_quota=dart.quota_used(),
                )
    log.info(
        "ingest_krx_financials.done", rows=total, targets=len(targets),
        failed=failed, quota_hit=quota_hit, dart_quota=dart.quota_used(),
    )
    return total
