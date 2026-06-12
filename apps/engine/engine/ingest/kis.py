"""한국투자증권(KIS) OpenAPI 인제스트 — 지수 시세부터.

토큰: /oauth2/tokenP (24시간 유효, 발급 분당 1회 제한) → 로컬 파일 캐시.
환경: KIS_ENV = real | paper | auto(실전 먼저 시도, 실패 시 모의 — 키가 어느
환경 발급분인지 모를 때).

지수 일봉: 국내주식 업종기간별시세(FHKUP03500100) — output2[].bstp_nmix_prpr.
적재는 macro 테이블(series_id=KOSPI/KOSDAQ) — 네이버/FRED 와 동일 경로.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from engine.config import get_settings
from engine.logging import get_logger

log = get_logger(__name__)

_DOMAINS = {
    "real": "https://openapi.koreainvestment.com:9443",
    "paper": "https://openapivts.koreainvestment.com:29443",
}
# 업종코드 — 0001 코스피 / 1001 코스닥
_INDEX_CODES = {"KOSPI": "0001", "KOSDAQ": "1001"}
_TOKEN_CACHE = Path(__file__).resolve().parents[2] / ".kis_token.json"


class KisAuthError(RuntimeError):
    pass


def _issue_token(domain: str, key: str, secret: str) -> dict:
    import httpx

    r = httpx.post(
        f"{domain}/oauth2/tokenP",
        json={"grant_type": "client_credentials", "appkey": key, "appsecret": secret},
        timeout=15,
    )
    body = r.json()
    if r.status_code != 200 or "access_token" not in body:
        raise KisAuthError(f"{r.status_code} {body.get('error_description') or body}")
    return body


def get_token() -> tuple[str, str]:
    """(access_token, domain). 파일 캐시 — 만료 30분 전까지 재사용.

    발급 분당 1회 제한이 있어 캐시 없이 반복 호출하면 EGW00133 로 막힌다.
    """
    s = get_settings()
    if not s.kis_app_key or not s.kis_app_secret:
        raise KisAuthError("KIS_APP_KEY/SECRET 미설정")

    if _TOKEN_CACHE.exists():
        try:
            c = json.loads(_TOKEN_CACHE.read_text("utf-8"))
            if c.get("key_tail") == s.kis_app_key[-6:] and time.time() < c.get("exp", 0) - 1800:
                return c["token"], c["domain"]
        except Exception:  # noqa: BLE001 — 캐시 손상은 무시하고 재발급
            pass

    envs = ["real", "paper"] if s.kis_env == "auto" else [s.kis_env]
    last_err: Exception | None = None
    for env in envs:
        domain = _DOMAINS.get(env)
        if not domain:
            raise KisAuthError(f"KIS_ENV 값 오류: {s.kis_env} (real|paper|auto)")
        try:
            body = _issue_token(domain, s.kis_app_key, s.kis_app_secret)
            token = body["access_token"]
            exp = time.time() + int(body.get("expires_in", 86400))
            _TOKEN_CACHE.write_text(
                json.dumps({"token": token, "domain": domain, "exp": exp, "key_tail": s.kis_app_key[-6:]}),
                "utf-8",
            )
            log.info("kis.token.issued", env=env)
            return token, domain
        except Exception as e:  # noqa: BLE001
            last_err = e
            log.warning("kis.token.fail", env=env, error=str(e)[:200])
    raise KisAuthError(f"토큰 발급 실패(모든 환경): {last_err}")


def fetch_index_daily(series: str, days: int = 30) -> list[dict]:
    """지수 일봉 — KIS 업종기간별시세. [{date, close}] 반환."""
    import httpx

    token, domain = get_token()
    s = get_settings()
    code = _INDEX_CODES[series]
    end = datetime.now()
    start = end - timedelta(days=days)
    r = httpx.get(
        f"{domain}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice",
        params={
            "FID_COND_MRKT_DIV_CODE": "U",
            "FID_INPUT_ISCD": code,
            "FID_INPUT_DATE_1": start.strftime("%Y%m%d"),
            "FID_INPUT_DATE_2": end.strftime("%Y%m%d"),
            "FID_PERIOD_DIV_CODE": "D",
        },
        headers={
            "authorization": f"Bearer {token}",
            "appkey": s.kis_app_key,
            "appsecret": s.kis_app_secret,
            "tr_id": "FHKUP03500100",
            "custtype": "P",
        },
        timeout=15,
    )
    body = r.json()
    if body.get("rt_cd") != "0":
        raise RuntimeError(f"KIS index {series}: {body.get('msg1')}")
    return normalize_index_output(body.get("output2") or [])


def normalize_index_output(output2: list[dict]) -> list[dict]:
    """KIS output2 → [{date, close}] (순수). 빈 행·비수치 제외, 날짜 오름차순."""
    rows: list[dict] = []
    for o in output2:
        d = str(o.get("stck_bsop_date") or "").strip()
        v = o.get("bstp_nmix_prpr")
        if len(d) != 8 or v in (None, ""):
            continue
        try:
            close = float(v)
        except (TypeError, ValueError):
            continue
        rows.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:8]}", "close": close})
    rows.sort(key=lambda r: r["date"])
    return rows


def to_macro_rows(series_id: str, rows: list[dict]) -> list[dict]:
    """[{date, close}] → macro 행 (순수)."""
    return [
        {"series_id": series_id, "date": r["date"], "value": r["close"], "source": "KIS"}
        for r in rows
    ]


def ingest_kr_indices(days: int = 30) -> int:
    """코스피·코스닥 지수 → macro. KIS 실패 시 네이버 파싱 폴백."""
    from engine.db import upsert

    total = 0
    try:
        for series in _INDEX_CODES:
            rows = to_macro_rows(series, fetch_index_daily(series, days=days))
            if rows:
                total += upsert("macro", rows, on_conflict="series_id,date")
        log.info("kis.index.done", rows=total)
        return total
    except Exception as e:  # noqa: BLE001 — KIS 장애 시에도 지수는 끊기면 안 됨
        log.warning("kis.index.fallback_naver", error=str(e)[:200])
        from engine.ingest import naver

        return naver.ingest_kr_indices()


def to_flow_amount(v: Any) -> float | None:
    """KIS 숫자 문자열 → float. (순수)"""
    if v in (None, ""):
        return None
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _kis_get(path: str, tr_id: str, params: dict) -> dict:
    """공통 GET — 토큰/헤더 부착. rt_cd != 0 이면 예외."""
    import httpx

    token, domain = get_token()
    s = get_settings()
    r = httpx.get(
        f"{domain}{path}",
        params=params,
        headers={
            "authorization": f"Bearer {token}",
            "appkey": s.kis_app_key,
            "appsecret": s.kis_app_secret,
            "tr_id": tr_id,
            "custtype": "P",
        },
        timeout=15,
    )
    body = r.json()
    if body.get("rt_cd") != "0":
        raise RuntimeError(f"KIS {tr_id}: {body.get('msg1')}")
    return body


def _yyyymmdd_to_iso(d: str) -> str:
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}"


# ── 수급 (투자자별 매매동향 + 프로그램) ──
# 네이버(외인·기관 주수)와 동일하게 '주수' 기준으로 저장 — 단위 일관성.

def normalize_investor(output: list[dict]) -> list[dict]:
    """투자자별(FHKST01010900) output → [{date, retail_net, foreign_net, inst_net}] (순수)."""
    rows: list[dict] = []
    for o in output:
        d = str(o.get("stck_bsop_date") or "").strip()
        if len(d) != 8:
            continue
        rows.append({
            "date": _yyyymmdd_to_iso(d),
            "retail_net": to_flow_amount(o.get("prsn_ntby_qty")),
            "foreign_net": to_flow_amount(o.get("frgn_ntby_qty")),
            "inst_net": to_flow_amount(o.get("orgn_ntby_qty")),
        })
    return rows


def normalize_program(output: list[dict]) -> list[dict]:
    """프로그램 일별(FHPPG04650200) output → [{date, program_net}] (순수, 주수)."""
    rows: list[dict] = []
    for o in output:
        d = str(o.get("stck_bsop_date") or "").strip()
        if len(d) != 8:
            continue
        rows.append({
            "date": _yyyymmdd_to_iso(d),
            "program_net": to_flow_amount(o.get("whol_smtn_ntby_qty")),
        })
    return rows


def fetch_investor_daily(symbol: str) -> list[dict]:
    """종목 투자자별 순매수 — 최근 ~30거래일."""
    body = _kis_get(
        "/uapi/domestic-stock/v1/quotations/inquire-investor",
        "FHKST01010900",
        {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": symbol},
    )
    return normalize_investor(body.get("output") or [])


def fetch_program_daily(symbol: str, days: int = 30) -> list[dict]:
    """프로그램 일별 순매수 — DATE_1 이 '끝 앵커'로 동작(그 날짜부터 과거 30행).

    실측(2026-06-12): DATE_1=과거로 주면 그 시점부터 역방향 페이징 — 최신을
    받으려면 DATE_1=오늘. days 인자는 시그니처 호환용(반환은 항상 ~30행).
    """
    _ = days
    today = datetime.now().strftime("%Y%m%d")
    body = _kis_get(
        "/uapi/domestic-stock/v1/quotations/program-trade-by-stock-daily",
        "FHPPG04650200",
        {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": symbol,
            "FID_INPUT_DATE_1": today,
            "FID_INPUT_DATE_2": today,
        },
    )
    return normalize_program(body.get("output") or [])


def merge_flow_rows(
    instrument_id: int,
    investor: list[dict],
    program: list[dict],
    days: int,
) -> list[dict]:
    """투자자별+프로그램을 날짜로 병합 → flows 행 (순수)."""
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    prog_by_date = {r["date"]: r.get("program_net") for r in program}
    rows: list[dict] = []
    for r in investor:
        if r["date"] < cutoff:
            continue
        rec: dict[str, Any] = {"instrument_id": instrument_id, "date": r["date"]}
        for k in ("retail_net", "foreign_net", "inst_net"):
            if r.get(k) is not None:
                rec[k] = r[k]
        p = prog_by_date.get(r["date"])
        if p is not None:
            rec["program_net"] = p
        if len(rec) > 2:
            rows.append(rec)
    return rows


def ingest_flows(days: int = 10, include_program: bool = True, workers: int = 6) -> int:
    """전 활성 종목 수급(개인·외인·기관·프로그램) → flows.

    KIS 유량 제한(실전 초당 20건) 고려 — 종목당 1~2호출, 워커 보수적.
    실패 종목은 건너뜀(다음 배치에서 재시도) — 네이버 폴백은 외인·기관만이라
    여기서는 사용하지 않는다(컬럼 불일치 방지).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    from engine.db import upsert
    from engine.ingest.runner import load_kr_instrument_map

    imap = load_kr_instrument_map()
    targets = [(sym, iid) for (sym, _exch), iid in imap.items()]

    def _one(t: tuple) -> tuple:
        sym, iid = t
        try:
            inv = fetch_investor_daily(sym)
            prog = fetch_program_daily(sym, days=days + 20) if include_program else []
            return sym, merge_flow_rows(iid, inv, prog, days), None
        except Exception as e:  # noqa: BLE001
            return sym, [], str(e)

    total = done = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(_one, t) for t in targets]
        for fut in as_completed(futures):
            sym, rows, err = fut.result()
            if err:
                failed += 1
                log.warning("kis.flows.fail", symbol=sym, error=err[:120])
            elif rows:
                total += upsert("flows", rows, on_conflict="instrument_id,date")
            done += 1
            if done % 200 == 0:
                log.info("kis.flows.progress", done=done, of=len(targets), rows=total, failed=failed)
    log.info("kis.flows.done", rows=total, targets=len(targets), failed=failed)
    return total


# ── 분봉 (당일) ──

def normalize_minute_bars(output2: list[dict], instrument_id: int) -> list[dict]:
    """당일분봉(FHKST03010200) output2 → ohlcv(1m) 행 (순수). ts = KST."""
    rows: list[dict] = []
    for o in output2:
        d = str(o.get("stck_bsop_date") or "").strip()
        h = str(o.get("stck_cntg_hour") or "").strip()
        if len(d) != 8 or len(h) != 6:
            continue
        op, hi, lo, cl = (to_flow_amount(o.get(k)) for k in ("stck_oprc", "stck_hgpr", "stck_lwpr", "stck_prpr"))
        if None in (op, hi, lo, cl):
            continue
        rows.append({
            "instrument_id": instrument_id,
            "ts": f"{_yyyymmdd_to_iso(d)}T{h[:2]}:{h[2:4]}:{h[4:6]}+09:00",
            "interval": "1m",
            "open": op, "high": hi, "low": lo, "close": cl,
            "volume": to_flow_amount(o.get("cntg_vol")) or 0,
        })
    return rows


def fetch_minute_bars(symbol: str, end_hour: str = "153000", loops: int = 14) -> list[dict]:
    """당일 1분봉 전체 — 호출당 30봉이라 시간 역방향 페이지네이션."""
    seen: dict[str, dict] = {}
    hour = end_hour
    for _ in range(loops):
        body = _kis_get(
            "/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice",
            "FHKST03010200",
            {
                "FID_ETC_CLS_CODE": "",
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": symbol,
                "FID_INPUT_HOUR_1": hour,
                "FID_PW_DATA_INCU_YN": "Y",
            },
        )
        out = body.get("output2") or []
        if not out:
            break
        for o in out:
            h = str(o.get("stck_cntg_hour") or "")
            if h:
                seen[h] = o
        earliest = min(str(o.get("stck_cntg_hour")) for o in out)
        if earliest <= "090100":
            break
        prev = datetime.strptime(earliest, "%H%M%S") - timedelta(minutes=1)
        hour = prev.strftime("%H%M%S")
    return sorted(seen.values(), key=lambda o: str(o.get("stck_cntg_hour")))


def ingest_minute_bars(symbols: list[str], end_hour: str = "153000") -> int:
    """지정 종목 당일 1분봉 → ohlcv(interval=1m). 핫스토리지 — 장기보관은 일봉."""
    from engine.db import upsert
    from engine.ingest.runner import load_kr_instrument_map

    imap = load_kr_instrument_map()
    by_symbol = {sym: iid for (sym, _exch), iid in imap.items()}
    total = 0
    for sym in symbols:
        iid = by_symbol.get(sym)
        if not iid:
            log.warning("kis.minute.unknown_symbol", symbol=sym)
            continue
        try:
            rows = normalize_minute_bars(fetch_minute_bars(sym, end_hour=end_hour), iid)
            if rows:
                total += upsert("ohlcv", rows, on_conflict="instrument_id,ts,interval")
        except Exception as e:  # noqa: BLE001
            log.warning("kis.minute.fail", symbol=sym, error=str(e)[:120])
    log.info("kis.minute.done", rows=total, symbols=len(symbols))
    return total


# ── 현재가 (실시간 폴링용 — WS 이전 단계) ──

def fetch_quote(symbol: str) -> dict:
    """현재가/등락률/거래량 스냅샷 (FHKST01010100)."""
    body = _kis_get(
        "/uapi/domestic-stock/v1/quotations/inquire-price",
        "FHKST01010100",
        {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": symbol},
    )
    o = body.get("output") or {}
    return {
        "symbol": symbol,
        "price": to_flow_amount(o.get("stck_prpr")),
        "change": to_flow_amount(o.get("prdy_vrss")),
        "change_pct": to_flow_amount(o.get("prdy_ctrt")),
        "volume": to_flow_amount(o.get("acml_vol")),
        "high": to_flow_amount(o.get("stck_hgpr")),
        "low": to_flow_amount(o.get("stck_lwpr")),
    }
