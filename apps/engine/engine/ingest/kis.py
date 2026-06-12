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
    """KIS 금액 문자열 → float(억원 단위 변환은 호출부). (순수, 향후 수급용)"""
    if v in (None, ""):
        return None
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None
