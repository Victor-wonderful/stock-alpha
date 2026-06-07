"""네이버 수급 변환 검증 — frgn.naver HTML → flows 행 (네트워크 없음)."""
from __future__ import annotations

import pandas as pd

from engine.ingest import naver

# frgn.naver 외국인·기관 표의 멀티헤더 구조를 축약 재현.
_HTML = """
<table class="type2">
  <thead>
    <tr><th>날짜</th><th>종가</th><th>전일비</th><th>등락률</th><th>거래량</th>
        <th>기관</th><th>외국인</th><th>외국인</th><th>외국인</th></tr>
    <tr><th>날짜</th><th>종가</th><th>전일비</th><th>등락률</th><th>거래량</th>
        <th>순매매량</th><th>순매매량</th><th>보유주수</th><th>보유율</th></tr>
  </thead>
  <tbody>
    <tr><td>2026.06.05</td><td>329,000</td><td>22,500</td><td>-6.40%</td>
        <td>31,299,200</td><td>-1,446,498</td><td>-4,240,844</td>
        <td>2,791,013,975</td><td>47.74%</td></tr>
    <tr><td>2026.06.04</td><td>351,500</td><td>9,000</td><td>-2.50%</td>
        <td>34,771,037</td><td>3,253,812</td><td>-12,414,744</td>
        <td>2,795,254,819</td><td>47.81%</td></tr>
  </tbody>
</table>
"""


def test_parse_frgn_table():
    df = naver.parse_frgn_table(_HTML)
    assert list(df.columns) == ["date", "inst_net", "foreign_net"]
    assert len(df) == 2
    first = df.iloc[0]
    assert first["date"] == "2026-06-05"
    assert first["inst_net"] == -1446498.0
    assert first["foreign_net"] == -4240844.0


def test_parse_frgn_table_no_match():
    df = naver.parse_frgn_table("<table><tr><td>무관</td></tr></table>")
    assert df.empty
    assert list(df.columns) == ["date", "inst_net", "foreign_net"]


def test_normalize_flows():
    df = pd.DataFrame(
        [
            {"date": "2026-06-05", "inst_net": -1446498.0, "foreign_net": -4240844.0},
            {"date": "2026-06-04", "inst_net": 3253812.0, "foreign_net": None},
        ]
    )
    rows = naver.normalize_flows(df, instrument_id=7)
    assert len(rows) == 2
    assert rows[0] == {
        "instrument_id": 7,
        "date": "2026-06-05",
        "inst_net": -1446498.0,
        "foreign_net": -4240844.0,
    }
    # foreign_net None 이면 키 자체를 넣지 않음
    assert "foreign_net" not in rows[1]
    assert rows[1]["inst_net"] == 3253812.0


def test_normalize_flows_empty():
    assert naver.normalize_flows(pd.DataFrame(), instrument_id=1) == []


def test_to_float():
    assert naver._to_float("-1,446,498") == -1446498.0
    assert naver._to_float("") is None
    assert naver._to_float("-") is None
    assert naver._to_float(None) is None
