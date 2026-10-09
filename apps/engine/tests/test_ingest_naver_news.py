"""네이버 종목뉴스 파서 — 순수 함수 테스트.

네이버 응답 구조가 바뀌면 파서가 조용히 0건을 반환한다(예외가 아니라 빈 결과).
배치는 성공으로 보이는데 뉴스만 안 쌓이는 형태라 눈치채기 어렵다 — 고정 샘플로 방어한다.
(2026-09-17 PC HTML 주소가 410 Gone 이 되어 3주간 0건이었다. 지금은 모바일 JSON.)
"""
from engine.ingest.naver_news import normalize_news, parse_news_json

# 실제 응답에서 발췌(2026-10-09, 000880). 묶음 2개에 같은 기사 중복 1건 포함, body 포함.
SAMPLE = [
    {"total": 2, "items": [
        {"id": "0030014243104", "officeId": "003", "articleId": "0014243104",
         "officeName": "뉴시스", "datetime": "202610090630", "type": "1",
         "title": "누리호 5차 발사 성공에...", "body": "본문은 저장하지 않는다",
         "titleFull": "누리호 5차 발사 성공에 &#39;K우주기업&#39; 빛났다…한화·HD현대",
         "mobileNewsUrl": "https://n.news.naver.com/mnews/article/003/0014243104"},
        {"id": "1380002244184", "officeId": "138", "articleId": "0002244184",
         "officeName": "디지털데일리", "datetime": "202610081732", "type": "1",
         "title": "美·中 &quot;AI 조선소&quot; 경쟁", "body": "..."},
    ]},
    {"total": 1, "items": [
        {"id": "0030014243104", "officeId": "003", "articleId": "0014243104",
         "officeName": "뉴시스", "datetime": "202610090630",
         "titleFull": "누리호 5차 발사 성공에 &#39;K우주기업&#39; 빛났다…한화·HD현대"},
    ]},
]


def test_parse_extracts_rows_and_dedupes():
    rows = parse_news_json(SAMPLE)
    # 같은 기사는 (언론사, 기사번호) 로 접혀 2건만 남는다 — 옛 HTML 과 같은 키 형식.
    assert [r["provider_article_id"] for r in rows] == ["003-0014243104", "138-0002244184"]


def test_parse_decodes_entities_and_prefers_full_title():
    rows = parse_news_json(SAMPLE)
    assert rows[0]["headline"] == "누리호 5차 발사 성공에 'K우주기업' 빛났다…한화·HD현대"
    assert rows[1]["headline"] == '美·中 "AI 조선소" 경쟁'


def test_parse_publishes_kst():
    assert parse_news_json(SAMPLE)[0]["published_at"] == "2026-10-09T06:30:00+09:00"


def test_parse_builds_url_when_missing():
    rows = parse_news_json(SAMPLE)
    assert rows[0]["url"] == "https://n.news.naver.com/mnews/article/003/0014243104"
    assert rows[1]["url"] == "https://n.news.naver.com/mnews/article/138/0002244184"


def test_parse_returns_empty_on_unknown_shape():
    assert parse_news_json({"error": "구조 변경"}) == []
    assert parse_news_json([{"items": [{"title": "키 없음"}]}]) == []
    assert parse_news_json([{"items": [{"officeId": "1", "articleId": "2",
                                        "title": "t", "datetime": "bad"}]}]) == []


def test_normalize_omits_body_and_sentiment():
    rows = normalize_news(parse_news_json(SAMPLE), instrument_id=257)
    assert rows
    for r in rows:
        # 본문은 언론사 저작물이라 저장하지 않는다.
        assert "body" not in r and "content" not in r
        # 감성은 키워드로 판정하지 않는다(공시 분류기 '해지·해제' 반전 사례).
        assert "sentiment" not in r
        assert r["instrument_id"] == 257
        assert r["provider"] == "naver"
