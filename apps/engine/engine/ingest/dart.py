"""DART(전자공시) 재무 인제스트 — OpenDART API.

  · fetch_*      : OpenDART 호출 (DART_API_KEY 필요)
  · normalize_*  : 순수 함수 — API json → financials 행. 네트워크 없이 테스트 가능.

reprt_code: 11011=사업(연간) 11012=반기 11013=1Q 11014=3Q
fs_div: CFS=연결, OFS=별도
"""
from __future__ import annotations

import httpx

from engine.config import get_settings
from engine.logging import get_logger

log = get_logger(__name__)

_API = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"

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


# ── 네트워크 fetch ──

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
    resp = httpx.get(_API, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def fetch_corp_code_map() -> dict[str, str]:
    """상장 종목코드(stock_code) → DART corp_code 매핑.

    OpenDART corpCode.xml(zip) 다운로드 후 파싱.
    """
    import io
    import zipfile
    from xml.etree import ElementTree as ET

    key = get_settings().dart_api_key
    if not key:
        raise RuntimeError("DART_API_KEY 미설정.")
    resp = httpx.get(
        "https://opendart.fss.or.kr/api/corpCode.xml",
        params={"crtfc_key": key},
        timeout=30,
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
    return out
