"""DART(전자공시) 재무 인제스트 — OpenDART API.

  · fetch_*      : OpenDART 호출 (DART_API_KEY 필요)
  · normalize_*  : 순수 함수 — API json → financials 행. 네트워크 없이 테스트 가능.

reprt_code: 11011=사업(연간) 11012=반기 11013=1Q 11014=3Q
fs_div: CFS=연결, OFS=별도
"""
from __future__ import annotations

from functools import lru_cache

import httpx

from engine.config import get_settings
from engine.logging import get_logger

log = get_logger(__name__)

_API = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
_STOCK_API = "https://opendart.fss.or.kr/api/stockTotqySttus.json"

# 계정명(공백 제거) → 스키마 컬럼. (sj_div 로 IS/BS/CF 구분)
_ACCOUNT_MAP = {
    # 손익계산서 (IS/CIS)
    "매출액": "revenue",
    "수익(매출액)": "revenue",
    "영업수익": "revenue",
    "영업이익": "op_income",
    "영업이익(손실)": "op_income",
    "당기순이익": "net_income",
    "당기순이익(손실)": "net_income",
    # 재무상태표 (BS)
    "자산총계": "assets",
    "자본총계": "equity",
    "부채총계": "debt",
    # 현금흐름표 (CF)
    "영업활동현금흐름": "ocf",
    "영업활동으로인한현금흐름": "ocf",
}

_REPRT_TO_PERIOD = {"11011": "FY", "11012": "H1", "11013": "Q1", "11014": "Q3"}


def _parse_amount(raw: str | None) -> float | None:
    """'1,234,567' / '(1,234)' / '' → float|None."""
    if raw is None:
        return None
    s = str(raw).strip().replace(",", "")
    if s in ("", "-"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


def normalize_financials(
    api_json: dict,
    instrument_id: int,
    bsns_year: str,
    reprt_code: str,
    fs_div: str,
) -> list[dict]:
    """OpenDART fnlttSinglAcntAll 응답 → financials 행 1개(또는 0개)."""
    items = api_json.get("list") or []
    if not items:
        return []

    period = f"{bsns_year}{_REPRT_TO_PERIOD.get(reprt_code, reprt_code)}"
    fs_type = "consolidated" if fs_div.upper() == "CFS" else "separate"

    rec: dict = {
        "instrument_id": instrument_id,
        "period": period,
        "fs_type": fs_type,
        "source": "DART",
    }
    # 공시일(point-in-time) — rcept_no 앞 8자리 = 접수일자(YYYYMMDD).
    # PEAD 등 이벤트 셋업은 이 날짜 이후에만 트리거해야 정직하다.
    rcept = str(items[0].get("rcept_no") or "")
    if len(rcept) >= 8 and rcept[:8].isdigit():
        rec["disclosed_at"] = f"{rcept[:4]}-{rcept[4:6]}-{rcept[6:8]}"
    for it in items:
        name = (it.get("account_nm") or "").replace(" ", "")
        col = _ACCOUNT_MAP.get(name)
        if col and col not in rec:  # 첫 매칭 우선
            val = _parse_amount(it.get("thstrm_amount"))
            if val is not None:
                rec[col] = val

    # 의미 있는 재무값이 하나라도 있어야 행 생성
    has_data = any(k in rec for k in ("revenue", "op_income", "net_income", "assets"))
    return [rec] if has_data else []


def normalize_shares(api_json: dict) -> float | None:
    """stockTotqySttus 응답 → 보통주 유통주식수(없으면 발행총수). 순수 함수.

    DART 필드명이 문서·버전마다 달라 후보키를 순차 탐색한다.
      유통주식수 후보: distb_stock_co
      발행총수 후보: istc_totqy / isu_stock_totqy
    se(구분) 가 '보통주' 인 행 우선, 없으면 '합계'/'계'.
    """
    items = api_json.get("list") or []
    if not items:
        return None

    def _val(it: dict, keys: tuple[str, ...]) -> float | None:
        for k in keys:
            v = _parse_amount(it.get(k))
            if v:
                return v
        return None

    common = [it for it in items if "보통" in (it.get("se") or "")]
    total = [it for it in items if (it.get("se") or "").strip() in ("합계", "계")]
    ordered = common or total or items
    for it in ordered:
        # 유통주식수(자기주식 제외) 우선, 없으면 발행총수
        v = _val(it, ("distb_stock_co",)) or _val(it, ("istc_totqy", "isu_stock_totqy"))
        if v:
            return v
    return None


# ── 일일 쿼터 가드 ──
# DART 한도는 키당 일 2만 건(KST 자정 리셋). 추정 분할 운영의 사고를 막기 위해
# 로컬 카운터로 호출을 세고, 한도 임박 시 DartQuotaError 로 중단시킨다.

import json as _json
import threading as _threading
from datetime import datetime as _dt
from datetime import timedelta as _td
from pathlib import Path as _Path

DART_DAILY_LIMIT = 19_500  # 공식 20,000 에서 안전 마진
_QUOTA_PATH = _Path(__file__).resolve().parents[2] / ".dart_quota.json"
_quota_lock = _threading.Lock()


class DartQuotaError(RuntimeError):
    """일일 호출 한도 도달 — 내일(KST 자정 후) 재개."""


def _kst_today() -> str:
    return (_dt.utcnow() + _td(hours=9)).strftime("%Y-%m-%d")


def quota_used(date: str | None = None) -> int:
    try:
        data = _json.loads(_QUOTA_PATH.read_text("utf-8"))
        return int(data.get(date or _kst_today(), 0))
    except Exception:  # noqa: BLE001
        return 0


def _count_call(n: int = 1) -> None:
    """호출 n건 기록. 한도 도달 시 DartQuotaError."""
    with _quota_lock:
        today = _kst_today()
        try:
            data = _json.loads(_QUOTA_PATH.read_text("utf-8"))
        except Exception:  # noqa: BLE001
            data = {}
        used = int(data.get(today, 0))
        if used + n > DART_DAILY_LIMIT:
            raise DartQuotaError(
                f"DART 일일 한도 도달 ({used}/{DART_DAILY_LIMIT}) — KST 자정 후 재개"
            )
        # 오늘 키만 유지(파일 비대 방지)
        _QUOTA_PATH.write_text(_json.dumps({today: used + n}), "utf-8")


# ── 네트워크 fetch ──

def fetch_shares(corp_code: str, bsns_year: str, reprt_code: str = "11011") -> float | None:
    """발행주식 총수 현황 → 보통주 유통/발행 주식수."""
    key = get_settings().dart_api_key
    if not key:
        raise RuntimeError("DART_API_KEY 미설정.")
    params = {
        "crtfc_key": key,
        "corp_code": corp_code,
        "bsns_year": bsns_year,
        "reprt_code": reprt_code,
    }
    _count_call()
    resp = httpx.get(_STOCK_API, params=params, timeout=20)
    resp.raise_for_status()
    j = resp.json()
    if j.get("status") not in ("000", None):
        log.warning("dart.shares.status", status=j.get("status"), msg=j.get("message"))
    return normalize_shares(j)


def fetch_financials(corp_code: str, bsns_year: str, reprt_code: str, fs_div: str) -> dict:
    """단일 회사 전체 재무제표 조회."""
    key = get_settings().dart_api_key
    if not key:
        raise RuntimeError("DART_API_KEY 미설정. opendart.fss.or.kr 에서 발급.")
    params = {
        "crtfc_key": key,
        "corp_code": corp_code,
        "bsns_year": bsns_year,
        "reprt_code": reprt_code,
        "fs_div": fs_div,
    }
    _count_call()
    resp = httpx.get(_API, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def _corp_cache_path() -> "os.PathLike[str] | str":
    import os
    import tempfile

    return os.path.join(tempfile.gettempdir(), "stock_alpha_dart_corpmap.json")


@lru_cache(maxsize=1)
def fetch_corp_code_map() -> dict[str, str]:
    """상장 종목코드(stock_code) → DART corp_code 매핑.

    OpenDART corpCode.xml(zip, ~수십MB) 다운로드 후 파싱. 결과를 임시폴더에
    JSON 캐시하여 재실행 시 네트워크/파싱을 건너뛴다. 프로세스 내에선 lru_cache.
    """
    import io
    import json
    import os
    import zipfile
    from xml.etree import ElementTree as ET

    cache = _corp_cache_path()
    if os.path.exists(cache):
        try:
            with open(cache, encoding="utf-8") as f:
                data = json.load(f)
            if data:
                return data
        except (OSError, ValueError):
            pass  # 캐시 손상 시 재다운로드

    key = get_settings().dart_api_key
    if not key:
        raise RuntimeError("DART_API_KEY 미설정.")
    resp = httpx.get(
        "https://opendart.fss.or.kr/api/corpCode.xml",
        params={"crtfc_key": key},
        timeout=60,
    )
    resp.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    xml = zf.read(zf.namelist()[0])
    root = ET.fromstring(xml)
    out: dict[str, str] = {}
    for item in root.iter("list"):
        stock = (item.findtext("stock_code") or "").strip()
        corp = (item.findtext("corp_code") or "").strip()
        if stock and corp:
            out[stock] = corp
    try:
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(out, f)
    except OSError:
        pass
    return out
