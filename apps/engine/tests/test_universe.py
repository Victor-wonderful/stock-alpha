"""유니버스 파서 검증 — 네이버 시총 HTML → 종목목록 (네트워크 없음)."""
from __future__ import annotations

from engine.ingest import universe

_HTML = """
<table class="type_2">
  <tr><td><a href="/item/main.naver?code=005930">삼성전자</a></td></tr>
  <tr><td><a href="/item/main.naver?code=000660">SK하이닉스</a></td></tr>
  <tr><td><a href="/item/main.naver?code=005935">삼성전자우</a></td></tr>
  <tr><td><a href="/item/main.naver?code=005385">현대차2우B</a></td></tr>
  <tr><td><a href="/item/main.naver?code=035420">NAVER</a></td></tr>
  <tr><td><a href="/item/main.naver?code=005930">삼성전자</a></td></tr>
</table>
"""


def test_parse_market_sum_basic():
    rows = universe.parse_market_sum(_HTML)
    syms = [r["symbol"] for r in rows]
    # 보통주만, 중복 제거
    assert syms == ["005930", "000660", "035420"]
    assert rows[0] == {"symbol": "005930", "name": "삼성전자"}


def test_parse_market_sum_excludes_preferred():
    rows = universe.parse_market_sum(_HTML)
    names = [r["name"] for r in rows]
    assert "삼성전자우" not in names      # '우' 접미
    assert "현대차2우B" not in names      # '2우B' 접미


def test_parse_market_sum_empty():
    assert universe.parse_market_sum("<table></table>") == []
