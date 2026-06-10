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

from engine.db import select_all
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
    """전 종목을 instruments 에 업서트(exchange=KOSPI|KOSDAQ). 시드 건수 반환.

    과거에는 exchange='KRX' + industry=시장 으로 저장했으나, DART 재무 배치가
    industry 를 업종코드로 덮어쓰며 시장 구분이 소실되는 사고가 있었다(2026-06-10).
    시장은 exchange 컬럼이 정위치. 레거시 'KRX' 행은 backfill_exchange() 로 갱신.
    """
    rows: list[dict] = []
    for m in markets:
        for it in fetch_market_codes(m):
            rows.append({
                "symbol": it["symbol"],
                "exchange": m,
                "name": it["name"],
                "asset_type": "stock",
                "currency": "KRW",
            })
    if not rows:
        return 0
    ensure_instruments(rows)
    log.info("universe.seed.done", rows=len(rows))
    return len(rows)


def backfill_exchange(markets: tuple[str, ...] = ("KOSPI", "KOSDAQ")) -> dict[str, int]:
    """레거시 exchange='KRX' 행을 네이버 시장별 목록으로 KOSPI/KOSDAQ 백필.

    unique(symbol, exchange) 라 신규 insert 가 아닌 in-place UPDATE 만 수행
    (중복 행 생성 없음). 목록에 없는 잔여 KRX 행(상폐 등)은 그대로 둔다.
    """
    from engine.db import get_client

    client = get_client()
    out: dict[str, int] = {}
    for m in markets:
        symbols = [it["symbol"] for it in fetch_market_codes(m)]
        n = 0
        for i in range(0, len(symbols), 200):        # IN 필터 길이 제한 → 청크
            chunk = symbols[i:i + 200]
            res = (
                client.table("instruments").update({"exchange": m})
                .in_("symbol", chunk).eq("exchange", "KRX").execute()
            )
            n += len(res.data or [])
        out[m] = n
        log.info("universe.backfill_exchange", market=m, updated=n)
    # 구버전 시딩이 industry 에 남긴 시장 라벨 제거(업종코드 자리)
    for m in markets:
        client.table("instruments").update({"industry": None}).eq(
            "industry", m
        ).execute()
    return out


_SPAC_RE = re.compile(r"스팩|기업인수목적")


def classify_universe() -> dict[str, int]:
    """실기업 vs 펀드/파생 분류 + 비활성화.

    DART corp_code 가 없는 종목(ETF/ETN/펀드 — DART 비공시자)은 asset_type='etf',
    active=false. 스팩(shell)도 active=false. 나머지(영업 기업)는 stock·active 유지.
    → 팩터/시그널은 active=true 만 처리하므로 스크리너에서 파생상품이 사라진다.
    """
    from engine.db import get_client
    from engine.ingest.dart import fetch_corp_code_map

    from engine.ingest.instruments import KR_EXCHANGES

    cmap = fetch_corp_code_map()
    rows = [
        r for r in select_all("instruments", "id,symbol,exchange,name")
        if r["exchange"] in KR_EXCHANGES
    ]

    fund = [r["symbol"] for r in rows if r["symbol"] not in cmap]
    spac = [
        r["symbol"] for r in rows
        if r["symbol"] in cmap and _SPAC_RE.search(r.get("name") or "")
    ]
    n_stock = len(rows) - len(fund) - len(spac)

    client = get_client()

    def _update(symbols: list[str], patch: dict) -> None:
        for i in range(0, len(symbols), 200):       # IN 필터 길이 제한 → 청크
            chunk = symbols[i:i + 200]
            client.table("instruments").update(patch).in_("symbol", chunk).in_(
                "exchange", list(KR_EXCHANGES)
            ).execute()

    _update(fund, {"active": False, "asset_type": "etf"})
    _update(spac, {"active": False})
    log.info("universe.classify.done", stock=n_stock, fund=len(fund), spac=len(spac))
    return {"stock": n_stock, "fund": len(fund), "spac": len(spac)}
