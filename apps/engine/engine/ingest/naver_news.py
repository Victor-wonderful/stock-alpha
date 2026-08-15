"""네이버 금융 종목뉴스 수집 — 제목·언론사·시각·원문링크만.

  · parse_*  : HTML → 행 (순수 함수, 테스트 대상)
  · fetch_*  : httpx 호출 (euc-kr)
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

_BASE = "https://finance.naver.com/item/news_news.naver"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
}
KST = timezone(timedelta(hours=9))

# 한 행: 제목(링크) · 언론사 · 날짜시각. 네이버가 연관기사를 같은 표에 섞어 넣어
# 같은 기사가 여러 번 잡히므로, 아래 정규화에서 (office_id, article_id) 로 접는다.
_ROW_RE = re.compile(
    r'<td class="title">\s*<a href="([^"]+)"[^>]*>(.*?)</a>.*?'
    r'<td class="info">(.*?)</td>.*?'
    r'<td class="date">(.*?)</td>',
    re.S,
)
_ID_RE = re.compile(r"article_id=(\d+).*?office_id=(\d+)")
_TAG_RE = re.compile(r"<[^>]+>")

_ENTITIES = {
    "&quot;": '"', "&apos;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&hellip;": "…", "&middot;": "·", "&lsquo;": "‘", "&rsquo;": "’",
    "&ldquo;": "“", "&rdquo;": "”", "&nbsp;": " ", "&uarr;": "↑", "&darr;": "↓",
}


def _clean(raw: str) -> str:
    s = _TAG_RE.sub("", raw)
    for k, v in _ENTITIES.items():
        s = s.replace(k, v)
    return " ".join(s.split()).strip()


def parse_news_table(html: str) -> list[dict]:
    """종목뉴스 HTML → [{provider_article_id, headline, source, published_at, url}] (순수).

    연관기사 중복은 provider_article_id 기준으로 접는다(첫 등장 유지).
    """
    out: list[dict] = []
    seen: set[str] = set()
    for href, title, source, date in _ROW_RE.findall(html):
        m = _ID_RE.search(href.replace("&amp;", "&"))
        if not m:
            continue
        article_id, office_id = m.group(1), m.group(2)
        key = f"{office_id}-{article_id}"
        if key in seen:
            continue
        seen.add(key)

        headline = _clean(title)
        if not headline:
            continue
        ts = _parse_kst(_clean(date))
        if ts is None:
            continue
        url = href if href.startswith("http") else "https://finance.naver.com" + href
        out.append({
            "provider_article_id": key,
            "headline": headline,
            "source": _clean(source) or None,
            "published_at": ts,
            "url": url.replace("&amp;", "&"),
        })
    return out


def _parse_kst(s: str) -> str | None:
    """'2026.08.14 09:28' → ISO8601(KST). 실패 시 None."""
    m = re.search(r"(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})", s)
    if not m:
        return None
    y, mo, d, h, mi = (int(x) for x in m.groups())
    return datetime(y, mo, d, h, mi, tzinfo=KST).isoformat()


def fetch_news(symbol: str, pages: int = 1) -> str:
    """종목뉴스 HTML(euc-kr). 페이지를 이어붙여 반환."""
    import httpx

    parts: list[str] = []
    headers = {
        **_HEADERS,
        "Referer": f"https://finance.naver.com/item/main.naver?code={symbol}",
    }
    for p in range(1, pages + 1):
        try:
            r = httpx.get(_BASE, params={"code": symbol, "page": str(p)},
                          headers=headers, timeout=20)
            r.encoding = "euc-kr"
            parts.append(r.text)
        except Exception as e:  # 한 종목 실패가 배치를 죽이지 않는다
            log.warning("naver.news.page_fail", symbol=symbol, page=p, error=str(e))
    return "\n".join(parts)


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
        rows = normalize_news(parse_news_table(fetch_news(sym, pages)), iid)
        if rows:
            total += upsert("news", rows,
                            on_conflict="provider,provider_article_id,instrument_id")
        time.sleep(sleep_sec)  # 예의상 간격 — 기존 크롤러와 동일 기조

    log.info("naver.news.done", symbols=len(symbols), rows=total)
    return total
