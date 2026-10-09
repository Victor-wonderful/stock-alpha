"""네이버 금융 종목뉴스 수집 — 제목·언론사·시각·원문링크만.

  · parse_*  : JSON → 행 (순수 함수, 테스트 대상)
  · fetch_*  : httpx 호출 (네이버 증권 모바일 JSON)
  · ingest_* : 정규화 + 적재

⚠️ 본문은 저장하지 않는다. 기사 본문은 언론사 저작물이라 수집·재배포 대상이 아니다.
제목은 원문 링크와 언론사명을 함께 보관해, 화면에서 '인용 + 출처 + 링크' 형태로만 쓴다.
VECTA 는 기사를 요약하지 않고, 같은 날 엔진이 측정한 수치를 옆에 붙여 대조한다
(사실은 저작권 대상이 아니지만, 기사 주장을 VECTA 문장으로 옮기면 검증 책임까지
넘어온다 — 검증 가능한 것만 VECTA 가 말한다).

수집 대상은 전 종목이 아니라 그날 리포트·추천이 나간 종목으로 한정한다.
2,500종목을 매일 긁을 이유가 없고 요청량만 커진다.
"""
from __future__ import annotations

import re
import time
from datetime import datetime, timedelta, timezone

from engine.logging import get_logger

log = get_logger(__name__)

# 2026-09-17 부터 PC 종목뉴스 HTML(finance.naver.com/item/news_news.naver)이 410 Gone 이다.
# 배치는 에러 없이 «0건»으로 지나가 3주간 뉴스가 한 건도 안 쌓였다(10/9 발견).
# 지금은 네이버 증권 모바일이 쓰는 JSON 을 읽는다 — 기사 키(언론사-기사번호)가 옛 HTML 과
# 같아서 이미 쌓인 행과 중복 없이 이어진다.
_BASE = "https://m.stock.naver.com/api/news/stock/{symbol}"
_PAGE_SIZE = 20
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
}
KST = timezone(timedelta(hours=9))

_TAG_RE = re.compile(r"<[^>]+>")

_ENTITIES = {
    "&quot;": '"', "&apos;": "'", "&#39;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&hellip;": "…", "&middot;": "·", "&lsquo;": "‘", "&rsquo;": "’",
    "&ldquo;": "“", "&rdquo;": "”", "&nbsp;": " ", "&uarr;": "↑", "&darr;": "↓",
}


def _clean(raw: str) -> str:
    s = _TAG_RE.sub("", raw or "")
    for k, v in _ENTITIES.items():
        s = s.replace(k, v)
    return " ".join(s.split()).strip()


def parse_news_json(groups: list) -> list[dict]:
    """종목뉴스 JSON → [{provider_article_id, headline, source, published_at, url}] (순수).

    응답은 «묶음» 목록이고 묶음마다 items(같은 사건의 연관기사)가 들어 있다.
    같은 기사가 여러 묶음에 다시 나오므로 provider_article_id 로 접는다(첫 등장 유지).
    본문(body)은 응답에 있어도 읽지 않는다 — 언론사 저작물이다.
    """
    out: list[dict] = []
    seen: set[str] = set()
    if not isinstance(groups, list):
        return out
    for g in groups:
        for it in (g or {}).get("items") or []:
            office, article = it.get("officeId"), it.get("articleId")
            if not office or not article:
                continue
            key = f"{office}-{article}"
            if key in seen:
                continue
            seen.add(key)
            headline = _clean(it.get("titleFull") or it.get("title") or "")
            ts = _parse_kst(str(it.get("datetime") or ""))
            if not headline or ts is None:
                continue
            url = it.get("mobileNewsUrl") or (
                f"https://n.news.naver.com/mnews/article/{office}/{article}")
            out.append({
                "provider_article_id": key,
                "headline": headline,
                "source": _clean(it.get("officeName") or "") or None,
                "published_at": ts,
                "url": url,
            })
    return out


def _parse_kst(s: str) -> str | None:
    """'202610091850' → ISO8601(KST). 실패 시 None."""
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})", s.strip())
    if not m:
        return None
    y, mo, d, h, mi = (int(x) for x in m.groups())
    try:
        return datetime(y, mo, d, h, mi, tzinfo=KST).isoformat()
    except ValueError:
        return None


def fetch_news(symbol: str, pages: int = 1) -> list:
    """종목뉴스 JSON 묶음 목록. 페이지를 이어붙여 반환. 실패 페이지는 건너뛴다."""
    import httpx

    groups: list = []
    for p in range(1, pages + 1):
        try:
            r = httpx.get(_BASE.format(symbol=symbol),
                          params={"pageSize": str(_PAGE_SIZE), "page": str(p)},
                          headers=_HEADERS, timeout=20)
            if r.status_code != 200:
                log.warning("naver.news.http", symbol=symbol, page=p, status=r.status_code)
                continue
            data = r.json()
            if isinstance(data, list):
                groups.extend(data)
        except Exception as e:  # 한 종목 실패가 배치를 죽이지 않는다
            log.warning("naver.news.page_fail", symbol=symbol, page=p, error=str(e))
    return groups


def normalize_news(rows: list[dict], instrument_id: int) -> list[dict]:
    """파서 결과 → news 테이블 행. sentiment/llm_summary 는 비워둔다.

    감성은 키워드로 판정하지 않는다. 정형화된 공시명에서도 '해지·해제' 반전을
    놓쳐 98건이 뒤집혔는데(2026-08-15), 자유 문장인 기사 제목은 훨씬 위험하다.
    """
    return [
        {
            "instrument_id": instrument_id,
            "provider": "naver",
            "provider_article_id": r["provider_article_id"],
            "headline": r["headline"],
            "source": r["source"],
            "url": r["url"],
            "published_at": r["published_at"],
        }
        for r in rows
    ]


def ingest_news(symbols: list[str], pages: int = 1, sleep_sec: float = 0.4) -> int:
    """대상 종목의 뉴스 수집 → news 적재. 반환: 적재 시도 행 수."""
    from engine.db import get_client, upsert

    cli = get_client()
    inst = (
        cli.table("instruments").select("id,symbol").in_("symbol", symbols).execute().data
        or []
    )
    id_by_symbol = {r["symbol"]: r["id"] for r in inst}

    total = 0
    for sym in symbols:
        iid = id_by_symbol.get(sym)
        if not iid:
            continue
        rows = normalize_news(parse_news_json(fetch_news(sym, pages)), iid)
        if rows:
            total += upsert("news", rows,
                            on_conflict="provider,provider_article_id,instrument_id")
        time.sleep(sleep_sec)  # 예의상 간격 — 기존 크롤러와 동일 기조

    log.info("naver.news.done", symbols=len(symbols), rows=total)
    # 대상이 여럿인데 전부 0건이면 «뉴스가 없는 날»이 아니라 수집이 깨진 것이다.
    # 2026-09-17 엔드포인트 폐지 때 이 경고가 없어 3주를 몰랐다.
    if total == 0 and len(id_by_symbol) >= 5:
        log.error("naver.news.all_empty", symbols=len(id_by_symbol),
                  hint="네이버 뉴스 응답 구조·주소 변경 의심 — fetch_news 확인")
    return total
