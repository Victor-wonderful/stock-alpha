"""유니버스 시드 — 네이버 시가총액 목록에서 KOSPI/KOSDAQ 전 종목 코드·이름 수집.

pykrx 의 종목목록 엔드포인트가 업스트림 breakage(빈 응답)라, 살아있는
네이버 금융 시가총액 페이지(sise_market_sum)에서 상장 종목 목록을 받는다.

  · parse_market_sum : 순수 함수 — HTML → [{symbol, name}]. 네트워크 없이 테스트.
  · fetch_market_codes: httpx 순회(euc-kr), 빈 페이지까지.
  · seed_universe     : instruments 업서트(exchange='KRX', asset_type='stock').

우선주(삼성전자우 등)·ETN 류는 1차로 이름 규칙으로 제외(보통주 중심 스크리너).
"""
from __future__ import annotations

import re

from engine.ingest.instruments import ensure_instruments
from engine.logging import get_logger

log = get_logger(__name__)

_BASE = "https://finance.naver.com/sise/sise_market_sum.naver"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
}
_SOSOK = {"KOSPI": 0, "KOSDAQ": 1}
# 우선주 패턴: '우', '우B', '1우', '2우B' 등으로 끝나는 종목명
_PREF_RE = re.compile(r"(\d?우[A-Z]?|우선주)$")


def parse_market_sum(html: str) -> list[dict]:
    """sise_market_sum HTML → [{symbol, name}] (순수). 우선주 제외."""
    codes = re.findall(r'/item/main\.naver\?code=(\d{6})"[^>]*>([^<]+)</a>', html)
    out: list[dict] = []
    seen: set[str] = set()
    for code, name in codes:
        name = name.strip()
        if not name or code in seen:
            continue
        if _PREF_RE.search(name):  # 우선주 제외
            continue
        seen.add(code)
        out.append({"symbol": code, "name": name})
    return out


# ── 네트워크 fetch ──

def fetch_market_codes(market: str, max_pages: int = 60) -> list[dict]:
    """한 시장(KOSPI|KOSDAQ)의 전 종목 [{symbol, name}] — 빈 페이지까지 순회."""
    import httpx

    sosok = _SOSOK[market]
    out: list[dict] = []
    seen: set[str] = set()
    for page in range(1, max_pages + 1):
        try:
            r = httpx.get(
                _BASE, params={"sosok": sosok, "page": page},
                headers=_HEADERS, timeout=20,
            )
            r.raise_for_status()
            html = r.content.decode("euc-kr", errors="replace")
            rows = parse_market_sum(html)
        except Exception as e:  # noqa: BLE001
            log.warning("universe.page_fail", market=market, page=page, error=str(e))
            break
        fresh = [x for x in rows if x["symbol"] not in seen]
        if not fresh:
            break  # 더 이상 새 종목 없음 → 마지막 페이지 도달
        for x in fresh:
            seen.add(x["symbol"])
        out.extend(fresh)
    log.info("universe.fetch.done", market=market, count=len(out))
    return out


def seed_universe(markets: tuple[str, ...] = ("KOSPI", "KOSDAQ")) -> int:
    """전 종목을 instruments 에 업서트(exchange='KRX'). 시드 건수 반환."""
    rows: list[dict] = []
    for m in markets:
        for it in fetch_market_codes(m):
            rows.append({
                "symbol": it["symbol"],
                "exchange": "KRX",
                "name": it["name"],
                "asset_type": "stock",
                "currency": "KRW",
                "industry": m,          # 서브마켓(KOSPI/KOSDAQ) 기록
            })
    if not rows:
        return 0
    ensure_instruments(rows)
    log.info("universe.seed.done", rows=len(rows))
    return len(rows)
