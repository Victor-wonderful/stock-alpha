"""네이버 종목뉴스 파서 — 순수 함수 테스트.

네이버 HTML 구조가 바뀌면 파서가 조용히 0건을 반환한다(예외가 아니라 빈 결과).
배치는 성공으로 보이는데 뉴스만 안 쌓이는 형태라 눈치채기 어렵다 — 고정 샘플로 방어한다.
"""
from engine.ingest.naver_news import normalize_news, parse_news_table

# 실제 응답에서 발췌(2026-08-15, 181710). 연관기사 중복 1건 포함.
SAMPLE = """
<table class="type5">
<tr>
  <td class="title"><a href="/item/news_read.naver?article_id=0001262345&amp;office_id=215&amp;code=181710&amp;page=1&amp;sm=">
    &quot;국민연금, 사고 또 샀다&quot;...역대급 실적에 3일째 &lsquo;폭등&rsquo;</a></td>
  <td class="info">한국경제TV</td>
  <td class="date">2026.08.14 09:28</td>
</tr>
<tr>
  <td class="title"><a href="/item/news_read.naver?article_id=0001262345&amp;office_id=215&amp;code=181710&amp;page=1&amp;sm=relation">
    &quot;국민연금, 사고 또 샀다&quot;...역대급 실적에 3일째 &lsquo;폭등&rsquo;</a></td>
  <td class="info">한국경제TV</td>
  <td class="date">2026.08.14 09:28</td>
</tr>
<tr>
  <td class="title"><a href="/item/news_read.naver?article_id=0005320819&amp;office_id=015&amp;code=181710">
    NHN, AI 데이터센터 실적 기여&hellip;목표가 7만원으로</a></td>
  <td class="info">한국경제</td>
  <td class="date">2026.08.14 08:24</td>
</tr>
</table>
"""


def test_parse_extracts_rows():
    rows = parse_news_table(SAMPLE)
    # 연관기사 중복은 (office_id, article_id) 로 접혀 2건만 남는다.
    assert len(rows) == 2
    assert {r["provider_article_id"] for r in rows} == {"215-0001262345", "015-0005320819"}


def test_parse_decodes_entities():
    rows = parse_news_table(SAMPLE)
    first = rows[0]
    assert first["headline"].startswith('"국민연금, 사고 또 샀다"')
    assert "&quot;" not in first["headline"]
    assert "…" in rows[1]["headline"]  # &hellip;


def test_parse_publishes_kst():
    rows = parse_news_table(SAMPLE)
    assert rows[0]["published_at"] == "2026-08-14T09:28:00+09:00"


def test_parse_builds_absolute_url():
    rows = parse_news_table(SAMPLE)
    assert rows[0]["url"].startswith("https://finance.naver.com/item/news_read.naver")
    assert "&amp;" not in rows[0]["url"]


def test_parse_returns_empty_on_unknown_markup():
    assert parse_news_table("<html><body>구조 변경</body></html>") == []


def test_normalize_omits_body_and_sentiment():
    rows = normalize_news(parse_news_table(SAMPLE), instrument_id=257)
    assert rows
    for r in rows:
        # 본문은 언론사 저작물이라 저장하지 않는다.
        assert "body" not in r and "content" not in r
        # 감성은 키워드로 판정하지 않는다(공시 분류기 '해지·해제' 반전 사례).
        assert "sentiment" not in r
        assert r["instrument_id"] == 257
        assert r["provider"] == "naver"
